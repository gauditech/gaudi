import _ from "lodash";

import { getRef } from "@src/common/refs";
import { assertUnreachable } from "@src/common/utils";
import { compile } from "@src/compiler/compiler";
import { getInternalExecutionRuntimeName } from "@src/composer/executionRuntimes";
import { parse } from "@src/parser/parser";
import {
  AuthenticatorMethodDef,
  AuthenticatorNamedModelDef,
  Definition,
} from "@src/types/definition";
import {
  AuthenticatorMethodSpec,
  AuthenticatorSpec,
  Specification,
} from "@src/types/specification";

/**
 * Compose authenticator block.
 */
export function composeAuthenticator(def: Definition, spec: AuthenticatorSpec | undefined): void {
  if (spec == undefined) {
    return;
  }

  // hardcoded authenticator name - not exposed through blueprint cause we don't support multiple auth blocks yet
  const name = "Auth";
  const authUserModel = composeTargetModel(def, spec.authUserModelName);
  const accessTokenModel = composeTargetModel(def, spec.accessTokenModelName);
  const method = composeMethod(def, spec.method);

  def.authenticator = {
    name,
    authUserModel,
    accessTokenModel,
    method,
  };
}

function composeTargetModel(def: Definition, modelName: string): AuthenticatorNamedModelDef {
  // get authenticator target model (injected in compiler)
  const model = getRef.model(def, modelName);

  return {
    name: modelName,
    refKey: model.refKey,
  };
}

function composeMethod(
  def: Definition,
  methodSpec: AuthenticatorMethodSpec
): AuthenticatorMethodDef {
  const kind = methodSpec.kind;
  if (kind === "basic") {
    return {
      kind,
    };
  } else {
    assertUnreachable(kind);
  }
}

/**
 * Create authenticator specs.
 */
export function compileAuthenticatorSpec(
  authenticatorSpec: AuthenticatorSpec | undefined
): Specification {
  if (authenticatorSpec == null) {
    return { models: [], entrypoints: [], populators: [], runtimes: [], authenticator: undefined };
  }

  const authUserModelName = authenticatorSpec.authUserModelName;
  const accessTokenModelName = authenticatorSpec.accessTokenModelName;

  const internalExecRuntimeName = getInternalExecutionRuntimeName();

  const AuthenticatorModel = `
    model ${authUserModelName} {
      field name { type text, validate { min 1 } }
      field username { type text, unique, validate { min 8 } }
      field password { type text, validate { min 8 } }
      relation tokens { from ${accessTokenModelName}, through authUser }
    }
    model ${accessTokenModelName} {
      field token { type text, unique }
      field expiryDate { type text }
      reference authUser { to ${authUserModelName} }
    }

    entrypoint Auth {
      target model ${authUserModelName} as authUser

      // login
      custom endpoint {
        path "login"
        method POST
        cardinality many

        action {
          fetch as existingAuthUser {
            virtual input username { type text }

            query {
              from ${authUserModelName}
              filter username is "first" // TODO: read from ctx
              limit 1
            }
            // TODO: throw error id user is not resolved
            // currently, "existingAuthUser" ends up empty and "authenticateUser" hook throws error
          }

          execute {
            virtual input password { type text }

            hook {
              arg clearPassword password
              arg hashPassword existingAuthUser.password
    
              runtime ${internalExecRuntimeName}
              source authenticateUser from "hooks/actions.js"
            }
          }

          // create access token
          create ${accessTokenModelName} as accessToken {
            set token cryptoToken(32)
            set expiryDate stringify(now() + 3600000) // 1 hour
            set authUser existingAuthUser
          }

          // return token
          execute {
            responds

            hook {
              arg status 200
              arg body_token accessToken.token

              runtime ${internalExecRuntimeName}
              source sendResponse from "hooks/actions.js"
            }
          }
        }
      }

      // logout
      custom endpoint {
        path "logout"
        method POST
        cardinality many

        action {
          fetch ${accessTokenModelName} as accessToken {
 
            query {
              from ${accessTokenModelName}
              filter token is "6Jty8G-HtB9CmB9xqRkJ3Z9LY5_or7pACnAQ6dERc1U" // TODO: read from ctx - token or @requestAuthToken
              limit 1
            }
          }

          delete accessToken {}

          // return status
          execute {
            responds

            hook {
              arg status 204

              runtime ${internalExecRuntimeName}
              source sendResponse from "hooks/actions.js"
            }
          }
        }
      }

      // register
      custom endpoint {
        path "register"
        method POST
        cardinality many

        action {
          fetch as existingUser {
            virtual input username { type text }
            
            query {
              from ${authUserModelName}
              filter username is "somename@example.com" // TODO: read from ctx - username
            }
          }


          // throw error if username already exists
          // TODO: this should be implemented as validator
          execute {
            hook {
              // throw if existing user is not empty
              arg condition existingUser
              arg status 400
              arg message concat("Username already exists: ", existingUser.username)

              runtime ${internalExecRuntimeName}
              source throwConditionalResponseError from "hooks/actions.js"
            }
          }

          create authUser {
            input { name, username }
            virtual input clearPassword { type text, validate { min 8 } }
            set password cryptoHash(clearPassword, 10)
          }

          // return created user
          execute {
            responds

            hook {
              arg status 201
              // body - see hook for details
              arg body_id authUser.id
              arg body_name authUser.name
              arg body_username authUser.username

              runtime ${internalExecRuntimeName}
              source sendResponse from "hooks/actions.js"
            }
          }
        }
      }
    }
  `;

  return compile(parse(AuthenticatorModel));
}

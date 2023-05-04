import { getInternalExecutionRuntimeName } from "@src/composer/executionRuntimes";
import { AUTH_TARGET_MODEL_NAME } from "@src/types/specification";

export const authUserModelName = AUTH_TARGET_MODEL_NAME;

function getCode(): string {
  const accessTokenModelName = `${authUserModelName}AccessToken`;

  const internalExecRuntimeName = getInternalExecutionRuntimeName();

  return `
    model ${authUserModelName} {
      field name { type string, validate { min 1 } }
      field username { type string, unique, validate { min 8 } }
      field passwordHash { type string, validate { min 8 } }
      relation tokens { from ${accessTokenModelName}, through authUser }
    }
    model ${accessTokenModelName} {
      field token { type string, unique }
      field expiryDate { type string }
      reference authUser { to ${authUserModelName} }
    }

    api Auth {
      entrypoint ${authUserModelName} {

        // login
        custom endpoint {
          path "login"
          method POST
          cardinality many

          action {
            fetch as existingAuthUser {
              virtual input username { type string }

              query {
                from ${authUserModelName} as a,
                filter { a.username is username },
                limit 1
              }
              // TODO: throw error id user is not resolved
              // currently, "existingAuthUser" ends up empty and "authenticateUser" hook throws error
            }

            execute {
              virtual input password { type string }

              hook {
                arg clearPassword password
                arg hashPassword existingAuthUser.passwordHash

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
            fetch as accessToken {

              query {
                from ${accessTokenModelName},
                filter { token is @requestAuthToken },
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
            create ${authUserModelName} as authUser {
              input { name, username }
              virtual input password { type string, validate { min 8 } }
              set passwordHash cryptoHash(password, 10)
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
    }
  `;
}

export const AuthPlugin = { code: getCode() };

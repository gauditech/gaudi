import { getInternalExecutionRuntimeName } from "@compiler/composer/executionRuntimes";

export const authUserModelName = "AuthUser";
export const accessTokenModelName = `${authUserModelName}AccessToken`;

function getCode(): string {
  const internalExecRuntimeName = getInternalExecutionRuntimeName();

  return `
    model ${authUserModelName} {
      field name { type string, validate { minLength(1) } }
      field username { type string, unique, validate { minLength(8) } }
      field passwordHash { type string, validate { minLength(8) } }
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

          extra inputs {
            field username { type string }
            field password { type string }
          }

          action {
            query as existingAuthUser {
              from ${authUserModelName} as a,
              filter { a.username is username },
              // TODO: this should be checked with validate V2, as it should fail with 401, not 500
              one
            }

            execute {
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
              set authUser_id existingAuthUser.id
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
            query as accessToken {
              from ${accessTokenModelName},
              filter { token is @requestAuthToken },
              one
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

          extra inputs {
            field password { type string, validate { minLength(8) } }
          }

          action {
            create ${authUserModelName} as authUser {
              input { name, username }
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

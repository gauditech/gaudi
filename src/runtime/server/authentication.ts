import { NextFunction, Request, Response } from "express";
import passport from "passport";
import { Strategy as BearerStrategy, VerifyFunctionWithRequest } from "passport-http-bearer";

import { dataToFieldDbnames, dataToFieldModelNames, getRef } from "@src/common/refs";
import { assertUnreachable, ensureNot } from "@src/common/utils";
import { getAppContext } from "@src/runtime/server/context";
import { DbConn } from "@src/runtime/server/dbConn";
import { BusinessError, errorResponse } from "@src/runtime/server/error";
import { Definition } from "@src/types/definition";

export type AuthenticationOptions = {
  allowAnonymous?: boolean;
};

export function buildAuthenticationHandler(def: Definition, options?: AuthenticationOptions) {
  if (!def.authenticator) return;

  const methodKind = def.authenticator.method.kind;
  if (methodKind === "basic") {
    return buildBasicAuthenticationHandler(def, options);
  } else {
    assertUnreachable(methodKind);
  }
}

// ---------- Basic authentication

/**
 * Create authentication request handler
 */
export function buildBasicAuthenticationHandler(def: Definition, options?: AuthenticationOptions) {
  const passportInstance = configurePassport(def);

  return async (req: Request, resp: Response, next: NextFunction) => {
    // return promise to make this handler async since passport's `authenticate` is synchronous
    await new Promise((resolve, reject) => {
      passportInstance.authenticate(
        "bearer",
        { session: false },
        (err: unknown, user?: Express.User) => {
          try {
            if (err) {
              reject(err);
            }

            // allow anonymous access
            if (!user && !(options?.allowAnonymous ?? false)) {
              throw new BusinessError("ERROR_CODE_UNAUTHORIZED", "Incorrect token credentials");
            }

            // share user with other handlers
            req.user = user;

            resolve(user); // this just resolves promise with some value (nobody will read this)
          } catch (err: unknown) {
            errorResponse(err);
            reject(err);
          }
        }
      )(req, resp, next);
    });
  };
}

// ---------- Passport middleware config

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface User {
      userId: number;
      token: string;
    }
  }
}

let PASSPORT: passport.Authenticator | undefined;
function configurePassport(def: Definition): passport.Authenticator {
  if (PASSPORT == null) {
    PASSPORT = new passport.Passport();
  }

  PASSPORT.use(
    new BearerStrategy<VerifyFunctionWithRequest>(
      { passReqToCallback: true },
      async (req, token, done) => {
        try {
          const dbConn = getAppContext(req).dbConn;

          if (token) {
            const user = await resolveAccessToken(dbConn, def, token);

            if (user) {
              // this result will appear on "request" object as "user" property
              done(null, user);
              return;
            }
          }

          console.log(`User access token not verified`);

          done(null, false);
        } catch (err: unknown) {
          done(err);
        }
      }
    )
  );

  return PASSPORT;
}

// ---------- DB queries

async function resolveAccessToken(
  dbConn: DbConn,
  def: Definition,
  token: string
): Promise<Express.AuthInfo | undefined> {
  ensureNot(def.authenticator, undefined, "Authenticator not defined.");

  const model = getRef.model(def, def.authenticator.accessTokenModel.refKey);

  const resultset: Record<string, string>[] = await dbConn
    .from(model.dbname)
    .where(dataToFieldDbnames(model, { token }));
  const result = resultset[0];

  if (result) {
    // TODO: fix any type to AuthInfo
    const record: any = dataToFieldModelNames(model, result);

    // we've converted record's DB names to model names so we can use them directly
    if (verifyTokenValidity(record.token, record.expiryDate)) {
      console.log("Token resolved", record);

      return { userId: record.authUser_id, token };
    } else {
      console.log("Token has expired");
    }
  } else {
    console.log("Unknown token");
  }

  return;
}

// ---------- Utils

/** Check if token is valid */
function verifyTokenValidity(token: string | undefined, expiryDate: string | undefined): boolean {
  if (token == null || expiryDate == null) return false;

  const currentExpiry = parseDate(expiryDate);

  if (currentExpiry == null || currentExpiry.valueOf() < Date.now()) return false;

  return true;
}

/** Simple date parsing function */
function parseDate(expiryDate: string): Date | undefined {
  const parsed = new Date(parseInt(expiryDate));

  // simple date parsing validation
  if (parsed.getTime().toString() === expiryDate) {
    return parsed;
  }
  return;
}

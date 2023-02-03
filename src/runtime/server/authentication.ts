import crypto from "crypto";

import { compare, hash } from "bcrypt";
import { NextFunction, Request, Response } from "express";
import passport from "passport";
import { Strategy as BearerStrategy, VerifyFunctionWithRequest } from "passport-http-bearer";

import { getRef } from "@src/common/refs";
import { getAppContext } from "@src/runtime/server/context";
import { DbConn } from "@src/runtime/server/dbConn";
import { BusinessError, errorResponse } from "@src/runtime/server/error";
import { EndpointConfig } from "@src/runtime/server/types";
import { Definition } from "@src/types/definition";

const TOKEN_SIZE = 32;
const TOKEN_EXPIRY_TIME = 1 * 60 * 60 * 1000; // 1h
const BCRYPT_SALT_ROUNDS = 10;

// ---------- Endpoints

/** Function that returns list of all authentication endpoints. */
export function buildEndpoints(def: Definition): EndpointConfig[] {
  if (!def.authenticator) return [];

  return [buildLocalAuthLoginHandler(def), buildAuthLogoutHandler(def)];
}

/**
 * Endpoint that allows users to auth via local user/pass
 */
export function buildLocalAuthLoginHandler(def: Definition): EndpointConfig {
  return {
    path: "/auth/login",
    method: "post",
    handlers: [
      async (req: Request, resp: Response) => {
        try {
          const dbConn = getAppContext(req).dbConn;

          const body = req.body;

          const username = body.username;
          const password = body.password;
          // console.log(`Creds: ${username}:${password}`);

          const result = await authenticateUser(dbConn, def, username, password);

          if (result) {
            const token = await createUserAccessToken(dbConn, def, result.id);

            // return created token
            resp.status(200).send({ token });
          } else {
            throw new BusinessError("ERROR_CODE_UNAUTHORIZED", "Unauthorized");
          }
        } catch (err: unknown) {
          errorResponse(err);
        }
      },
    ],
  };
}

/**
 * Endpoint that allows local logout
 */
export function buildAuthLogoutHandler(def: Definition): EndpointConfig {
  return {
    path: "/auth/logout",
    method: "post",
    handlers: [
      authenticationHandler(def, { allowAnonymous: true }),
      async (req: Request, resp: Response) => {
        try {
          if (!req.isAuthenticated()) {
            resp.sendStatus(204);
            return;
          }

          const token = req.user.token;
          const dbConn = getAppContext(req).dbConn;
          await dbConn.delete().from(getAuthDbName(def, "ACCESS_TOKEN_MODEL")).where({ token });

          resp.sendStatus(204);
        } catch (err: unknown) {
          errorResponse(err);
        }
      },
    ],
  };
}

// ---------- Authentication request handler

export type AuthenticationOptions = {
  allowAnonymous?: boolean;
};

/**
 * Create authentication request handler
 *
 */
export function authenticationHandler(def: Definition, options?: AuthenticationOptions) {
  const passportInstance = configurePassport(def);

  return async (req: Request, resp: Response, next: NextFunction) => {
    // return promise to make this handler async since passport's `authenticate` is synchronous
    await new Promise((resolve, reject) => {
      passportInstance.authenticate("bearer", { session: false }, (err, user) => {
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
      })(req, resp, next);
    });
  };
}

// ---------- Passport middleware config

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface User {
      id: number;
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
          console.log(`Verifying user access token: ${token}`);
          const dbConn = getAppContext(req).dbConn;

          if (token) {
            const result = await resolveUserFromToken(dbConn, def, token);

            if (result) {
              // this result will appear on "request" object as "user" property
              done(null, { id: result.id, token });
            } else {
              done(null, false);
            }
          } else {
            done(null, false);
          }
        } catch (err: unknown) {
          done(err);
        }
      }
    )
  );

  return PASSPORT;
}

// ---------- DB queries

async function resolveUserFromToken(
  dbConn: DbConn,
  def: Definition,
  token: string
): Promise<{ id: number } | undefined> {
  const result = await dbConn
    .select("target_id", "token", "expirydate")
    .from(getAuthDbName(def, "ACCESS_TOKEN_MODEL"))
    .where({ token });

  if (result.length == 1) {
    const row = result[0];

    if (verifyTokenValidity(row.token, row.expirydate)) {
      return { id: row.target_id };
    } else {
      console.log("Token has expired");
    }
  } else {
    console.log("Unknown token");
  }

  return;
}

async function authenticateUser(
  dbConn: DbConn,
  def: Definition,
  username: string,
  password: string
): Promise<{ id: number } | undefined> {
  const result = await dbConn
    .select("password", "id")
    .from(getAuthDbName(def, "TARGET_MODEL"))
    .where({ username });

  if (result.length === 1) {
    const row = result[0];

    const passwordsMatching = await verifyPassword(password, row.password);

    if (passwordsMatching) {
      return {
        id: row.id,
      };
    } else {
      console.log("Authentication failed: passwords do not match");
    }
  } else {
    console.log(`Username "${username}" not found`);
  }

  return;
}

/** Create user's access token. */
async function createUserAccessToken(dbConn: DbConn, def: Definition, id: number): Promise<string> {
  const newToken = generateAccessToken();
  const newExpiryDate = new Date(Date.now() + TOKEN_EXPIRY_TIME).toISOString();

  // insert fresh token
  await dbConn
    .insert({ target_id: id, token: newToken, expirydate: newExpiryDate })
    .into(getAuthDbName(def, "ACCESS_TOKEN_MODEL"));

  return newToken;
}

// ---------- Utils

/** Check if token is valid */
function verifyTokenValidity(token: string | undefined, expiryDate: string | undefined): boolean {
  if (token == null || expiryDate == null) return false;

  const currentExpiry = parseDate(expiryDate);

  if (currentExpiry == null) return false;

  if (currentExpiry.valueOf() < Date.now()) return false;

  return true;
}

/** Simple date parsing function */
function parseDate(expiryDate: string): Date | undefined {
  const parsed = new Date(Date.parse(expiryDate));

  // simple date parsing validation
  if (parsed.toISOString() === expiryDate) {
    return parsed;
  }
  return;
}

/** Generate random access token. */
export function generateAccessToken(size = TOKEN_SIZE): string {
  return crypto.randomBytes(size).toString("base64url");
}

/** Hash clear text password so it can be safely stored (eg. DB). */
export function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_SALT_ROUNDS);
}

/** Verify that clear text password matches the hashed one. */
export function verifyPassword(clearPassword: string, hashedPassword: string): Promise<boolean> {
  return compare(clearPassword, hashedPassword);
}

/** Resolve authenticator models by type */
function getAuthDbName(def: Definition, model: "TARGET_MODEL" | "ACCESS_TOKEN_MODEL") {
  if (def.authenticator == null) {
    throw new Error("Cannot authenticate user. Authenticator not defined.");
  }

  switch (model) {
    case "TARGET_MODEL":
      return getRef.model(def, def.authenticator.targetModel.refKey).dbname;
    case "ACCESS_TOKEN_MODEL":
      return getRef.model(def, def.authenticator.accessTokenModel.refKey).dbname;
  }
}

import crypto from "crypto";

import { compare, hash } from "bcrypt";
import { NextFunction, Request, Response } from "express";
import passport from "passport";
import { Strategy as BearerStrategy, VerifyFunction } from "passport-http-bearer";

import { getContext } from "@src/runtime/server/context";
import { BusinessError, errorResponse } from "@src/runtime/server/error";
import { EndpointConfig } from "@src/runtime/server/types";

const TOKEN_SIZE = 32;
const TOKEN_EXPIRY_TIME = 1 * 60 * 60 * 1000; // 1h
const BCRYPT_SALT_ROUNDS = 10;

// ---------- Endpoints

/** Function that returns list of all authentication endpoints. */
export function buildEndpoints(): EndpointConfig[] {
  return [buildLocalAuthLoginHandler(), buildAuthLogoutHandler()];
}

/**
 * Endpoint that allows users to auth via local user/pass
 */
export function buildLocalAuthLoginHandler(): EndpointConfig {
  return {
    path: "/auth/login",
    method: "post",
    handlers: [
      async (req: Request, resp: Response) => {
        try {
          const body = req.body;

          const username = body.username;
          const password = body.password;
          // console.log(`Creds: ${username}:${password}`);

          const result = await authenticateUser(username, password);

          if (result) {
            const token = await createUserAccessToken(result.id);

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
export function buildAuthLogoutHandler(): EndpointConfig {
  return {
    path: "/auth/logout",
    method: "post",
    handlers: [
      async (_req: Request, resp: Response) => {
        try {
          // TODO: do something eg. remove token, cookie, ...

          // we don't have access to token here so we can't delete/expire it
          // maybe we could add it to request in passport `verify` fn where eg. `req.user = { id, token }`

          resp.sendStatus(200);
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
export function authenticationHandler(options?: AuthenticationOptions) {
  const passportIntance = configurePassport();

  return (req: Request, resp: Response, next: NextFunction) => {
    passportIntance.authenticate("bearer", { session: false }, (err, user) => {
      try {
        if (err) {
          return next(err);
        }

        // allow anonymous access
        if (!user && !(options?.allowAnonymous ?? false)) {
          throw new BusinessError("ERROR_CODE_UNAUTHORIZED", "Incorrect token credentials");
        }

        req.user = user;
        next();
      } catch (err: unknown) {
        errorResponse(err);
      }
    })(req, resp, next);
  };
}

// ---------- Passport middleware config

let PASSPORT: passport.Authenticator | undefined;
function configurePassport(): passport.Authenticator {
  if (PASSPORT == null) {
    PASSPORT = new passport.Passport();
  }

  PASSPORT.use(
    new BearerStrategy<VerifyFunction>(async (token, done) => {
      try {
        console.log(`Verifying user access token: ${token}`);

        if (token) {
          const result = await resolveUserFromToken(token);

          if (result) {
            // this result will appear on "request" object as "user" property
            done(null, result);
          } else {
            done(null, false);
          }
        } else {
          done(null, false);
        }
      } catch (err: unknown) {
        done(err);
      }
    })
  );

  return PASSPORT;
}

// ---------- DB queries

async function resolveUserFromToken(token: string): Promise<{ id: string } | undefined> {
  const result = await getContext().dbConn.from("useraccesstoken").where({ token });
  // console.log("RESULTS", result);

  if (result.length == 1) {
    const row = result[0];

    if (verifyTokenValidity(row.token, row.expirydate)) {
      return { id: row.user_id };
    } else {
      console.log("Token has expired");
    }
  } else {
    console.log("Unknown token");
  }

  return;
}

async function authenticateUser(
  username: string,
  password: string
): Promise<{ id: number } | undefined> {
  const result = await getContext().dbConn.select("*").from("userauthlocal").where({ username });
  // console.log("RESULTS", result);

  if (result.length === 1) {
    const row = result[0];

    const passwordsMatching = await verifyPassword(password, row.password);

    if (passwordsMatching) {
      return {
        id: row.user_id,
      };
    } else {
      console.log("Passwords do not match");
    }
  } else {
    console.log(`Username "${username}" not found`);
  }

  return;
}

/** Create user's access token. */
async function createUserAccessToken(userId: number): Promise<string> {
  const newToken = generateAccessToken();
  const newExpiryDate = new Date(Date.now() + TOKEN_EXPIRY_TIME).toISOString();

  // insert fresh token
  await getContext()
    .dbConn.insert({ user_id: userId, token: newToken, expirydate: newExpiryDate })
    .into("useraccesstoken");

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

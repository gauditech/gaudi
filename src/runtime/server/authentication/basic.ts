import crypto from "crypto";

import { compare, hash } from "bcrypt";
import { NextFunction, Request, Response } from "express";
import _ from "lodash";
import passport from "passport";
import { Strategy as BearerStrategy, VerifyFunctionWithRequest } from "passport-http-bearer";

import { dataToFieldDbnames, getRef } from "@src/common/refs";
import { assertUnreachable } from "@src/common/utils";
import { executeActions } from "@src/runtime/common/action";
import {
  assignNoReferenceValidators,
  fetchReferenceIds,
} from "@src/runtime/common/constraintValidation";
import {
  createRecordValidationErrorFromCustom,
  validateEndpointFieldset,
} from "@src/runtime/common/validation";
import { getAppContext } from "@src/runtime/server/context";
import { DbConn } from "@src/runtime/server/dbConn";
import { BusinessError, errorResponse } from "@src/runtime/server/error";
import { EndpointConfig } from "@src/runtime/server/types";
import { Vars } from "@src/runtime/server/vars";
import {
  ActionDef,
  CreateEndpointDef,
  CreateOneAction,
  Definition,
  EndpointDef,
  UpdateEndpointDef,
  UpdateOneAction,
} from "@src/types/definition";

const TOKEN_SIZE = 32;
const TOKEN_EXPIRY_TIME = 1 * 60 * 60 * 1000; // 1h
const BCRYPT_SALT_ROUNDS = 10;

// ---------- Endpoints

/** Function that returns list of all authentication endpoints. */
export function buildEndpoints(def: Definition, pathPrefix = ""): EndpointConfig[] {
  return [
    buildLocalAuthLoginEndpoint(def, pathPrefix),
    buildAuthLogoutEndpoint(def, pathPrefix),
    buildRegistrationEndpoint(def, pathPrefix),
  ];
}

/**
 * Endpoint that allows users to auth via local user/pass
 */
function buildLocalAuthLoginEndpoint(def: Definition, pathPrefix = ""): EndpointConfig {
  return {
    path: `${pathPrefix}/login`,
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
function buildAuthLogoutEndpoint(def: Definition, pathPrefix = ""): EndpointConfig {
  return {
    path: `${pathPrefix}/logout`,
    method: "post",
    handlers: [
      buildAuthenticationHandler(def, { allowAnonymous: true }),
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

/**
 * Endpoint for registering local users
 */
function buildRegistrationEndpoint(def: Definition, pathPrefix = ""): EndpointConfig {
  return {
    path: `${pathPrefix}/register`,
    method: "post",
    handlers: [
      async (req: Request, resp: Response) => {
        let tx;
        try {
          const endpoint = def.authenticator?.method.endpoints?.register;
          if (endpoint == null) {
            throw new Error("Registration endpoint definition not found in authenticator");
          }

          // remove placeholder actions instead of which we'll execute user registration action
          const epActions = filterPlaceholderActions(endpoint);

          tx = await getAppContext(req).dbConn.transaction();
          const contextVars = new Vars();

          const body = req.body;
          console.log("BODY", body);

          const referenceIds = await fetchReferenceIds(def, tx, epActions, body);
          assignNoReferenceValidators(endpoint.fieldset, referenceIds);
          const validationResult = await validateEndpointFieldset(endpoint.fieldset, body);
          console.log("Validation result", validationResult);

          const user = await createAuthUser(tx, def, body);
          contextVars.set("@auth", user);

          await executeActions(
            def,
            tx,
            { input: validationResult, vars: contextVars, referenceIds },
            epActions
          );

          await tx.commit();

          // return created token
          resp.status(201).send(user);
        } catch (err) {
          await tx?.rollback();

          errorResponse(err);
        }
      },
    ],
  };
}

// ---------- Request handlers

export type AuthenticationOptions = {
  allowAnonymous?: boolean;
};

/**
 * Create authentication request handler
 */
export function buildAuthenticationHandler(def: Definition, options?: AuthenticationOptions) {
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

/** Create user's access token. */
type UserCreateBody = {
  name: string;
  username: string;
  password: string;
};

async function createAuthUser(
  dbConn: DbConn,
  def: Definition,
  body: Record<string, any>
): Promise<{ id: number; name: string; username: string }> {
  // check if username is already taken
  // TODO: could we turn this into a validator
  const existingUser = await resolveUsername(def, dbConn, body.username);
  if (existingUser != null) {
    throw new BusinessError(
      "ERROR_CODE_VALIDATION",
      "Validation error",
      createRecordValidationErrorFromCustom([
        {
          name: "username",
          value: body.username,
          errorMessage: `Username "${body.username}" already exists`,
          errorType: "",
        },
      ])
    );
  }

  const hashedPassword = await hashPassword(body.password);
  const user: UserCreateBody = {
    name: body.name,
    username: body.username,
    password: hashedPassword,
  };

  // insert new user
  const result = await dbConn
    .insert(dataToFieldDbnames(getRef.model(def, def.authenticator!.targetModel.refKey), user))
    .into(getAuthDbName(def, "TARGET_MODEL"))
    .returning(["id", "name", "username"]);

  if (!result.length) throw new Error("Error inserting user");

  return result[0];
}

async function resolveUsername(
  def: Definition,
  dbConn: DbConn,
  username: string
): Promise<{ id: number } | undefined> {
  const result = await dbConn
    .select("id")
    .from(getAuthDbName(def, "TARGET_MODEL"))
    .whereRaw("LOWER(username) = ?", username.toLowerCase());

  return result.length > 0 ? result[0] : undefined;
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
  ensureAuthenticator(def.authenticator);

  switch (model) {
    case "TARGET_MODEL":
      return getRef.model(def, def.authenticator.targetModel.refKey).dbname;
    case "ACCESS_TOKEN_MODEL":
      return getRef.model(def, def.authenticator.accessTokenModel.refKey).dbname;
    default:
      assertUnreachable(model);
  }
}

/**
 * Filter out placeholder actions from endpoint
 *
 * Default create and update actions are always created with endpoint
 * Since basic auth is implemented using custom actions whic cannot be represented through blueprint
 * these default actions need to be removed and specific auth action will be executed instead and
 * before other method custom event actions-
 *
 * TODO: remove filtering defualt auth actions once custom (hook) actions are supported
 */
function filterPlaceholderActions(endpoint: EndpointDef): ActionDef[] {
  if (endpoint.kind !== "create" && endpoint.kind !== "update") return [];

  // default action has the same alias as ep target
  return endpoint.actions.filter(
    (a) => (a.kind !== "create-one" && a.kind !== "update-one") || a.alias !== endpoint.target.alias
  );
}

function ensureAuthenticator<T>(auth: T | undefined | null): asserts auth is NonNullable<T> {
  if (auth === null || auth === undefined) throw new Error("Authenticator not defined.");
}

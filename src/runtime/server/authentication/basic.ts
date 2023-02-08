import crypto from "crypto";

import { compare, hash } from "bcrypt";
import { NextFunction, Request, Response } from "express";
import _ from "lodash";
import passport from "passport";
import { Strategy as BearerStrategy, VerifyFunctionWithRequest } from "passport-http-bearer";

import { buildEndpointPath } from "@src/builder/query";
import { dataToFieldDbnames, getRef } from "@src/common/refs";
import { assertUnreachable, ensureNot } from "@src/common/utils";
import { ActionContext, executeActions } from "@src/runtime/common/action";
import {
  assignNoReferenceValidators,
  fetchReferenceIds,
} from "@src/runtime/common/constraintValidation";
import {
  createRecordValidationErrorFromCustom,
  validateEndpointFieldset,
} from "@src/runtime/common/validation";
import { buildEndpointQueries } from "@src/runtime/query/endpointQueries";
import { executeQueryTree } from "@src/runtime/query/exec";
import { getAppContext } from "@src/runtime/server/context";
import { DbConn } from "@src/runtime/server/dbConn";
import { BusinessError, errorResponse } from "@src/runtime/server/error";
import { EndpointConfig } from "@src/runtime/server/types";
import { Vars } from "@src/runtime/server/vars";
import { CreateEndpointDef, Definition, UpdateEndpointDef } from "@src/types/definition";

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
    buildUpdatePasswordEndpoint(def, pathPrefix),
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
  const endpoint = def.authenticator?.method.endpoints?.register;
  if (endpoint == null) {
    throw new Error("Registration endpoint definition not found in authenticator");
  }

  return buildCustomCreateEndpoint(def, `${pathPrefix}/register`, endpoint, (def, dbConn, ctx) => {
    return createAuthUser(dbConn, def, ctx.input);
  });
}

/**
 * Update local users' passwords
 */

function buildUpdatePasswordEndpoint(def: Definition, pathPrefix = ""): EndpointConfig {
  const endpoint = def.authenticator?.method.endpoints?.updatePassword;
  if (endpoint == null) {
    throw new Error("Update password endpoint definition not found in authenticator");
  }

  return buildCustomUpdateEndpoint(
    def,
    `${pathPrefix}/updatePassword`,
    endpoint,
    async (def, dbConn, ctx) => {
      const user = ctx.vars.get("@auth");

      const username = user.username;
      const newPassword = (ctx.input.password as string) ?? "";
      const currentPassword = (ctx.input.currentPassword as string) ?? "";

      // verify old credentials before storing the new ones
      const result = await authenticateUser(dbConn, def, username, currentPassword);
      if (result == null) {
        throw new BusinessError("ERROR_CODE_UNAUTHORIZED", "Unauthorized");
      }

      return updateAuthUserPassword(def, dbConn, user.id, newPassword);
    }
  );
}

// ---------- Custom endpoint builders

export type CustomActionHandler = (
  def: Definition,
  dbConn: DbConn,
  ctx: ActionContext
) => Promise<unknown>;

function buildCustomCreateEndpoint(
  def: Definition,
  path: string,
  endpoint: CreateEndpointDef,
  customActionHandler: CustomActionHandler
): EndpointConfig {
  const queries = buildEndpointQueries(def, endpoint);

  return {
    path,
    method: "post",
    handlers: [
      buildAuthenticationHandler(def, { allowAnonymous: true }),
      async (req: Request, resp: Response) => {
        let tx;
        try {
          console.log("AUTH USER", req.user);
          tx = await getAppContext(req).dbConn.transaction();
          const contextVars = new Vars();

          if (queries.authQueryTree && req.user) {
            const results = await executeQueryTree(
              tx,
              def,
              queries.authQueryTree,
              new Vars({ id: req.user.id }),
              []
            );
            const result = findOne(results);
            contextVars.set("@auth", result);
          }

          const body = req.body;
          console.log("BODY", body);

          console.log("FIELDSET", endpoint.fieldset);
          const referenceIds = await fetchReferenceIds(def, tx, endpoint.actions, body);
          assignNoReferenceValidators(endpoint.fieldset, referenceIds);
          const validationResult = await validateEndpointFieldset(endpoint.fieldset, body);
          console.log("Validation result", validationResult);

          const ctx = { input: validationResult, vars: contextVars, referenceIds };

          const result = await customActionHandler(def, tx, ctx);
          contextVars.set(endpoint.target.alias, result);

          await executeActions(def, tx, ctx, endpoint.actions);

          await tx.commit();

          resp.json(result);
        } catch (err) {
          await tx?.rollback();

          errorResponse(err);
        }
      },
    ],
  };
}
function buildCustomUpdateEndpoint(
  def: Definition,
  path: string,
  endpoint: UpdateEndpointDef,
  customActionHandler: CustomActionHandler
): EndpointConfig {
  const queries = buildEndpointQueries(def, endpoint);

  return {
    path,
    method: "patch",
    handlers: [
      buildAuthenticationHandler(def, { allowAnonymous: true }),
      async (req: Request, resp: Response) => {
        let tx;
        try {
          console.log("AUTH USER", req.user);
          tx = await getAppContext(req).dbConn.transaction();
          const contextVars = new Vars();

          if (queries.authQueryTree && req.user) {
            const results = await executeQueryTree(
              tx,
              def,
              queries.authQueryTree,
              new Vars({ id: req.user.id }),
              []
            );
            const result = findOne(results);
            contextVars.set("@auth", result);
          }

          const body = req.body;
          console.log("BODY", body);

          const referenceIds = await fetchReferenceIds(def, tx, endpoint.actions, body);
          assignNoReferenceValidators(endpoint.fieldset, referenceIds);
          const validationResult = await validateEndpointFieldset(endpoint.fieldset, body);
          console.log("Validation result", validationResult);

          const ctx = { input: validationResult, vars: contextVars, referenceIds };

          const result = await customActionHandler(def, tx, ctx);
          contextVars.set(endpoint.target.alias, result);

          await executeActions(def, tx, ctx, endpoint.actions);

          await tx.commit();

          resp.json(result);
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
          const dbConn = getAppContext(req).dbConn;

          if (token) {
            const result = await resolveUserFromToken(dbConn, def, token);

            if (result) {
              // this result will appear on "request" object as "user" property
              done(null, { id: result.id, token });
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
  ensureNot(def.authenticator, undefined, "Authenticator not defined.");

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
    .insert(dataToFieldDbnames(getRef.model(def, def.authenticator.targetModel.refKey), user))
    .into(getAuthDbName(def, "TARGET_MODEL"))
    .returning(["id", "name", "username"]);

  if (!result.length) throw new Error("Error inserting user");

  return result[0];
}

async function updateAuthUserPassword(
  def: Definition,
  dbConn: DbConn,
  userId: number,
  password: string
) {
  ensureNot(def.authenticator, undefined, "Authenticator not defined.");

  const hashedPassword = await hashPassword(password);

  // insert new user
  const result = await dbConn(getAuthDbName(def, "TARGET_MODEL"))
    .update(
      dataToFieldDbnames(getRef.model(def, def.authenticator.targetModel.refKey), {
        password: hashedPassword,
      })
    )
    .where({ id: userId })
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
  ensureNot(def.authenticator, undefined, "Authenticator not defined.");

  switch (model) {
    case "TARGET_MODEL":
      return getRef.model(def, def.authenticator.targetModel.refKey).dbname;
    case "ACCESS_TOKEN_MODEL":
      return getRef.model(def, def.authenticator.accessTokenModel.refKey).dbname;
    default:
      assertUnreachable(model);
  }
}

/** Return only one resulting row. If result contains 0 or more than 1 row, throw error. */
// TODO: extract this and the one from endpoints.ts to some utils file
function findOne<T>(result: T[]): T {
  if (result.length === 0) {
    throw new BusinessError("ERROR_CODE_RESOURCE_NOT_FOUND", "Resource not found");
  }
  if (result.length > 1) {
    throw new BusinessError("ERROR_CODE_SERVER_ERROR", "Internal error");
  }

  return result[0];
}

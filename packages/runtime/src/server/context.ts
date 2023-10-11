import { EndpointPath } from "@gaudi/compiler/dist/builder/query";
import { Express, Request, Response, Router } from "express";
import { Knex } from "knex";

import { extractPathParams } from "./endpoints";

import { AppConfig } from "@runtime/config";
import { DbConn } from "@runtime/server/dbConn";

// ----- app specific context

/** Construct describing app server context. */
export type AppContext = {
  dbConn: DbConn;
  config: Readonly<AppConfig>;
};

export type AppContextKey = Request | Express | Router;

/** Bind app context instance to key object. */
export function bindAppContext(key: AppContextKey, ctx: AppContext): void {
  bindContext(key, ctx);
}

/**
 * Get app context instance bound to key object.
 *
 * Throws error if context is not found.
 */
export function getAppContext(key: AppContextKey): AppContext {
  const ctx = getAContext<AppContext>(key);
  if (!ctx) {
    throw new Error("App context not found. You should call bindAppContext() first.");
  }

  return ctx;
}

// ----- generic context impl

const bindings = new WeakMap();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function bindContext(key: object, ctx: any): void {
  bindings.set(key, ctx);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getAContext<M = any>(key: object): M | undefined {
  return bindings.get(key);
}

/**
 * REQUEST CONTEXT
 */

export type RequestContext = Record<string, unknown> & {
  _express: { request: Request; response: Response };
  _db: { connection: Knex; transaction: null };
};

export async function buildInitialContext(
  request: Request,
  response: Response,
  endpointPath: EndpointPath
): Promise<RequestContext> {
  const ctx = getAppContext(request);
  // const tx = await ctx.dbConn.transaction();
  const tx = null;
  const pathParams = extractPathParams(endpointPath, request.params);
  return {
    _express: { request, response },
    _db: { connection: ctx.dbConn, transaction: tx },
    pathParams,
  };
}

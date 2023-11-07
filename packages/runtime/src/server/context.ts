import { EndpointPath } from "@gaudi/compiler/dist/builder/query";
import { Express, Request, Response, Router } from "express";
import _ from "lodash";

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

type Storage = Record<string, any>;

export type GlobalContext = {
  _server?: {
    req: Request;
    res: Response;
    dbConn: DbConn;
  };
  fieldset: Storage;
  pathParams: Storage;
  aliases: Storage;
  referenceThroughs: Storage;
  localContext: Storage;
};

export function initializeContext(initial: Partial<GlobalContext>): GlobalContext {
  return Object.assign(
    {
      fieldset: {},
      pathParams: {},
      aliases: {},
      referenceThroughs: {},
      localContext: {},
    },
    initial
  );
}

export function initializeRequestContext(
  req: Request,
  res: Response,
  endpointPath: EndpointPath
): GlobalContext {
  const appCtx = getAppContext(req);
  const dbConn = appCtx.dbConn;
  const params = Object.assign({}, req.query, req.params);
  const pathParams = extractPathParams(endpointPath, params);
  return initializeContext({ pathParams, _server: { dbConn, req, res } });
}

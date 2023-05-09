import { Express, Request } from "express";

import { RuntimeConfig } from "@src/runtime/config.js";
import { DbConn } from "@src/runtime/server/dbConn.js";

// ----- app specific context

/** Construct describing app server context. */
export type AppContext = {
  dbConn: DbConn;
  config: Readonly<RuntimeConfig>;
};

export type AppContextKey = Request | Express;

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

import { EndpointPath } from "@gaudi/compiler/dist/builder/query";
import { Express, Request, Response, Router } from "express";
import { flatten } from "flat";
import { Knex } from "knex";
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

/**
 * REQUEST CONTEXT
 */

export class Storage<T extends object = object> {
  private _storage: Record<string, unknown> & T;
  constructor(initial: T) {
    // commiting a TypeScript sin, it seems
    this._storage = initial as T as any;
  }

  get(...path: (undefined | string | string[])[]): unknown {
    const finalPath = _.compact(path.flatMap((p) => _.castArray(p)));
    return _.get(this._storage, finalPath);
  }

  set(path: string | string[], value: unknown): void {
    _.set(this._storage, path, value);
  }

  collect(...path: (undefined | string | string[])[]): unknown[] {
    const finalPath = _.compact(path.flatMap((p) => _.castArray(p)));
    return collect(this._storage, finalPath);
  }

  flatten(): Record<string, unknown> {
    // FIXME only collect paths needed in the expression
    return flatten(_.omit(this._storage, "_express", "_db"), {
      delimiter: "__",
    });
  }

  copy(): Storage<T> {
    return new Storage(_.cloneDeep(this._storage));
  }
}

type RequestContextParams = {
  _express: { req: Request; res: Response };
  _db: { conn: Knex };
  fieldset: Record<string, unknown>;
  pathParams: Record<string, string | number>;
  queryParams: Request["query"];
};
export class RequestContext extends Storage<RequestContextParams> {
  constructor(req: Request, res: Response, ePath: EndpointPath) {
    const appCtx = getAppContext(req);
    const pathParams = extractPathParams(ePath, req.params);
    const queryParams = req.query;
    super({
      _express: { req, res },
      _db: { conn: appCtx.dbConn },
      // FIXME whitelist using FieldsetDef
      fieldset: req.body,
      pathParams,
      queryParams,
    });
  }

  copy(): RequestContext {
    return super.copy() as RequestContext;
  }

  get _express() {
    return this.get("_express") as RequestContextParams["_express"];
  }

  get _db() {
    return this.get("_db") as RequestContextParams["_db"];
  }

  get pathParams() {
    return this.get("pathParams") as RequestContextParams["pathParams"];
  }

  get queryParams() {
    return this.get("queryParams") as RequestContextParams["queryParams"];
  }
}

function collect(vars: any, path: string[]): unknown[] {
  if (_.isEmpty(path)) {
    return vars;
  }
  const [name, ...rest] = path;
  if (_.isArray(vars)) {
    return _.compact(vars.flatMap((v) => collect(_.get(v, name), rest)));
  } else {
    return collect(_.get(vars, name), rest);
  }
}

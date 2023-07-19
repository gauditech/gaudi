import { Definition } from "@gaudi/compiler/dist/types/definition";
import { NextFunction, Request, Response, Router, json } from "express";

import { AppConfig } from "@runtime/config";
import { setupServerApis } from "@runtime/server/api";
import { AppContext, bindAppContext } from "@runtime/server/context";
import { createDbConn } from "@runtime/server/dbConn";
import { HttpResponseError } from "@runtime/server/error";
import { ServerRequestHandler } from "@runtime/server/types";

// ----- middleware

/**
 * Binds AppContext instance to express and request instances so it's
 * accessible to server's internals (eg. req handlers).
 */
export function bindAppContextHandler(app: Router, ctx: AppContext) {
  bindAppContext(app, ctx);

  return (req: Request, _resp: Response, next: NextFunction) => {
    bindAppContext(req, ctx);

    next();
  };
}

/**
 * Catch and handle any endpoint error. Start DB transaction for this handler.
 *
 * Express by default puts every SQL query in it's own transaction and this handler
 * creates a single transaction for entire request on this handler.
 * It would be better to put db stuff in it's own middleware but in `express@4.x`
 * one middleware cannot await on another async middleware)
 */
export function endpointGuardHandler(handler: ServerRequestHandler) {
  return async (req: Request, resp: Response, next: NextFunction) => {
    try {
      await handler(req, resp, next);
    } catch (err) {
      next(err);
    }
  };
}

/** Handle errors */
export function errorHandler(error: unknown, _req: Request, resp: Response, _next: NextFunction) {
  if (error instanceof HttpResponseError) {
    resp.status(error.status).send(error.body);
  } else {
    console.error("[ERROR]", error);

    resp.status(500).send("Unknown error");
  }
}

/** Simple request logger */
export function requestLogger(req: Request, resp: Response, next: NextFunction) {
  req.on("data", () => {
    console.log(`[ENTRY] ${req.method} ${req.originalUrl}`);
  });
  resp.on("finish", () => {
    console.log(`[REQ] ${req.method} ${req.originalUrl} ${resp.statusCode}`);
  });

  next();
}

export function createAppContext(config: AppConfig) {
  return {
    dbConn: createDbConn(config.dbConnUrl, {
      schema: config.dbSchema,
    }),
    config: config,
  };
}

export function gaudiMiddleware(router: Router, def: Definition, config: AppConfig) {
  const ctx = createAppContext(config);
  router.use(bindAppContextHandler(router, ctx));

  router.use(json()); // middleware for parsing application/json body
  router.use(requestLogger);

  setupServerApis(def, router);

  router.use(errorHandler);
}

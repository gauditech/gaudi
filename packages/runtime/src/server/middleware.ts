import { initLogger } from "@gaudi/compiler";
import { Definition } from "@gaudi/compiler/dist/types/definition";
import { Express, NextFunction, Request, Response, json } from "express";

import { AppConfig } from "@runtime/config";
import { setupServerApis } from "@runtime/server/api";
import { AppContext, bindAppContext } from "@runtime/server/context";
import { createDbConn } from "@runtime/server/dbConn";
import { HttpResponseError } from "@runtime/server/error";
import { ServerRequestHandler } from "@runtime/server/types";

const logger = initLogger("gaudi:runtime:server");

// ----- middleware

/**
 * Binds AppContext instance to express and request instances so it's
 * accessible to server's internals (eg. req handlers).
 */
export function bindAppContextHandler(app: Express, ctx: AppContext) {
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
    logger.error("[ERROR]", error);

    resp.status(500).send("Unknown error");
  }
}

/** Simple request logger */
export function requestLogger(req: Request, resp: Response, next: NextFunction) {
  req.on("data", () => {
    logger.debug(`[ENTRY] ${req.method} ${req.originalUrl}`);
  });
  resp.on("finish", () => {
    logger.debug(`[REQ] ${req.method} ${req.originalUrl} ${resp.statusCode}`);
  });

  next();
}

export function createAppContext(config: AppConfig) {
  return {
    dbConn: createDbConn(config.dbConnUrl),
    config: config,
  };
}

export function gaudiMiddleware(app: Express, def: Definition, config: AppConfig) {
  const ctx = createAppContext(config);
  app.use(bindAppContextHandler(app, ctx));

  app.use(json()); // middleware for parsing application/json body
  app.use(requestLogger);

  setupServerApis(def, app);

  app.use(errorHandler);

  app.on("gaudi:cleanup", () => ctx.dbConn.destroy());
}

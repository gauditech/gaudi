import { Express, NextFunction, Request, Response } from "express";

import { AppContext, bindAppContext } from "@src/runtime/server/context";
import { HttpResponseError } from "@src/runtime/server/error";
import { ServerRequestHandler } from "@src/runtime/server/types";

// ----- middleware

/**
 * Binds AppContext instance to express and request instances so it's
 * accessible to server's internals (eg. req handlers).
 */
export function bindAppContextHandler(app: Express, ctx: AppContext) {
  bindAppContext(app, ctx);

  return (req: Request, resp: Response, next: NextFunction) => {
    bindAppContext(req, ctx);

    next();
  };
}

/** Catch and handle any endpoint error. */
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
  resp.on("finish", () => {
    console.log(`[REQ] ${req.method} ${req.originalUrl} ${resp.statusCode}`);
  });

  next();
}

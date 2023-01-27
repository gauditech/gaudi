import { Express, NextFunction, Request, Response } from "express";

import { AppContext, bindAppContext, getAppContext } from "@src/runtime/server/context";
import { HttpResponseError } from "@src/runtime/server/error";
import { ServerRequestHandler } from "@src/runtime/server/types";

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
    let tx;
    try {
      /*
       * Every request get an instance of the original `AppContext` but that one is in autocommit mode
       * This handler will create a transaction for the entire request and replace original request
       * `AppContext` with a new (tx) o.ne
       */
      // get original ctx
      const ctx = getAppContext(req);

      // create a new context with DB transaction and bind it to request
      tx = await ctx.dbConn.transaction();
      const txCtx: AppContext = {
        dbConn: tx,
        config: ctx.config,
      };
      bindAppContext(req, txCtx);

      await handler(req, resp, next);

      await tx.commit();
    } catch (err) {
      await tx?.rollback();
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

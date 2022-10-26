import { NextFunction, Request, Response } from "express";

import { HttpResponseError } from "@src/runtime/server/error";
import { ServerRequestHandler } from "@src/runtime/server/types";

// ----- middleware

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

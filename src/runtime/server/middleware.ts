import { Request, Response } from "express";

import { HttpResponseError } from "@src/runtime/server/error";
import { ServerMiddlewareNextFn, ServerRequestHandler } from "@src/runtime/server/types";

// ----- middleware

/** Catch and handle any endpoint error. */
export function endpointGuardHandler(handler: ServerRequestHandler) {
  return async (req: Request, resp: Response, next: (err?: unknown) => void) => {
    try {
      await handler(req, resp);
    } catch (err) {
      if (err instanceof HttpResponseError) {
        resp.status(err.status).send(err.body);
      } else {
        next(err);
      }
    }
  };
}

/** Handle unexpected errors */
export function unexpectedErrorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: ServerMiddlewareNextFn
) {
  console.error("[ERROR]", error);

  res.status(500).send("Unknown error");
}

/** Simple request logger */
export function requestLogger(req: Request, resp: Response, next: ServerMiddlewareNextFn) {
  resp.on("finish", () => {
    console.log(`[REQ] ${req.method} ${req.originalUrl} ${resp.statusCode}`);
  });

  next();
}

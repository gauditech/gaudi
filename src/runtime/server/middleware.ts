import { Request, Response } from "express";

import { EndpointHttpResponseError, GaudiBusinessError } from "@src/runtime/server/error";
import { ServerMiddlewareNextFn, ServerRequestHandler } from "@src/runtime/server/types";

// ----- middleware

/** Catch and report async endpoint errors like normal ones. This will become unnecessary in express 5.x */
export function endpointHandlerGuard(handler: ServerRequestHandler) {
  return async (req: Request, resp: Response, next: (err?: unknown) => void) => {
    try {
      await handler(req, resp);
    } catch (err) {
      next(err);
    }
  };
}

/** Simple request logger */
export function requestLogger(req: Request, resp: Response, next: ServerMiddlewareNextFn) {
  resp.on("finish", () => {
    console.log(`[REQ] ${req.method} ${req.originalUrl} ${resp.statusCode}`);
  });

  next();
}

/** Error logging middleware */
export function errorLogger(
  error: unknown,
  req: Request,
  res: Response,
  next: ServerMiddlewareNextFn
) {
  // TODO: not all errors should be logged as "error" (eg. "resource not found" business error)
  console.error("[ERROR]", error);

  next(error);
}

/** Central error responder */
export function errorResponder(
  error: unknown,
  _: Request,
  res: Response,
  __: ServerMiddlewareNextFn
) {
  if (error instanceof EndpointHttpResponseError) {
    res.status(error.status).json(error.response);
  } else if (error instanceof GaudiBusinessError) {
    console.warn(
      'Business errors (GaudiBusinessError) should be caught in endpoints and wrapped in an "EndpointHttpResponseError"'
    );

    res.status(500).send(error);
  } else {
    // default error handler
    res.status(500).send(error);
  }
}

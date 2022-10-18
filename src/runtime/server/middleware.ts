import { Request, Response } from "express";

import { EndpointError } from "@src/runtime/server/error";
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
    console.log(`[REQ] \${req.method} \${req.originalUrl} \${resp.statusCode}`);
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
  if (error instanceof EndpointError) {
    res.status(error.status).json(error.body);
  } else {
    // default error handler
    res.status(500).send(error);
  }
}

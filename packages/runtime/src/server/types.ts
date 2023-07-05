import { NextFunction, Request, Response } from "express";

export type ServerHttpMethods = "all" | "get" | "post" | "put" | "patch" | "delete";

export type ServerRequestHandler =
  | ((request: Request, response: Response) => void | Promise<void>)
  | ((req: Request, resp: Response, next: NextFunction) => void | Promise<void>);

export type EndpointConfig = {
  path: string;
  method: ServerHttpMethods;
  handlers: ServerRequestHandler[];
};

export type ServerMiddlewareNextFn = (err?: unknown) => void;

import { Request, Response } from "express";

export type ServerHttpMethods = "all" | "get" | "post" | "put" | "patch";

export type ServerRequestHandler = (request: Request, response: Response) => void | Promise<void>;

export type EndpointConfig = {
  path: string;
  method: ServerHttpMethods;
  handler: ServerRequestHandler;
};

export type ServerMiddlewareNextFn =  (err?: unknown) => void

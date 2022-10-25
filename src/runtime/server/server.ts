import express, { json } from "express";

import { setupEndpoints } from "@src/runtime/server/endpoints";
import { requestLogger, unexpectedErrorHandler } from "@src/runtime/server/middleware";
import { Definition } from "@src/types/definition";

export type CreateServerConfig = {
  port: number;
  host: string;
  definition: Definition;
};

export function createServer(config: CreateServerConfig) {
  const app = express();

  const port = config.port || 3000;
  const host = config.host || "0.0.0.0";

  app.use(json()); // middleware for parsing application/json body
  app.use(requestLogger);

  setupEndpoints(app, config.definition);

  app.use(unexpectedErrorHandler);

  app.listen(config.port, config.host, () => {
    console.log(`App is started on ${host}:${port}`);
  });

  return app;
}

import express, { json } from "express";

import { setupServerApis } from "@src/runtime/server/api";
import { errorHandler, requestLogger } from "@src/runtime/server/middleware";
import { Definition } from "@src/types/definition";

export type CreateServerConfig = {
  port: number;
  host: string;
  definition: Definition;
  outputFolder: string;
};

export function createServer(config: CreateServerConfig) {
  const app = express();

  const port = config.port || 3000;
  const host = config.host || "0.0.0.0";

  app.use(json()); // middleware for parsing application/json body
  app.use(requestLogger);

  setupServerApis(config.definition, app, { outputFolder: config.outputFolder });

  app.use(errorHandler);

  app.listen(config.port, config.host, () => {
    console.log(`App is started on ${host}:${port}`);
  });

  return app;
}

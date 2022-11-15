import express, { json } from "express";

import { setupServerApis } from "@src/runtime/server/api";
import { getContext } from "@src/runtime/server/context";
import { errorHandler, requestLogger } from "@src/runtime/server/middleware";
import { Definition } from "@src/types/definition";

export type CreateServerConfig = {
  port: number;
  host: string;
  definition: Definition;
  outputFolder: string;
};

export function createServer(definition: Definition) {
  const config = getContext().config;

  const app = express();

  const port = config.port || 3000;
  const host = config.host || "0.0.0.0";

  app.use(json()); // middleware for parsing application/json body
  app.use(requestLogger);

  setupServerApis(definition, app);

  app.use(errorHandler);

  app.listen(config.port, config.host, () => {
    console.log(`App is started on ${host}:${port}`);
  });

  return app;
}

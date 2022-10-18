import express from "express";

import { setupEndpoints } from "@src/runtime/server/endpoints";
import { errorLogger, errorResponder, requestLogger } from "@src/runtime/server/middleware";
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

  setupEndpoints(app, config.definition);

  app.use(requestLogger);
  app.use(errorLogger);
  app.use(errorResponder);

  app.listen(config.port, config.host, () => {
    console.log(`App is started on ${host}:${port}`);
  });

  return app;
}

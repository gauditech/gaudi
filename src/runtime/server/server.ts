import express, { json } from "express";
import fileUpload from "express-fileupload";

import { RuntimeConfig } from "@src/runtime/config";
import { setupServerApis } from "@src/runtime/server/api";
import { createDbConn } from "@src/runtime/server/dbConn";
import { bindAppContextHandler, errorHandler, requestLogger } from "@src/runtime/server/middleware";
import { Definition } from "@src/types/definition";

export type CreateServerConfig = {
  port: number;
  host: string;
  definition: Definition;
  outputFolder: string;
};

export function createServer(definition: Definition, config: RuntimeConfig) {
  const app = express();

  const port = config.port || 3000;
  const host = config.host || "0.0.0.0";

  const ctx = createAppContext(config);
  app.use(bindAppContextHandler(app, ctx));

  app.use(json()); // middleware for parsing application/json body
  app.use(fileUpload()); // middleware for parsing files from request body, eg. `curl -F`
  app.use(requestLogger);

  setupServerApis(definition, app);

  app.use(errorHandler);

  app.listen(config.port, config.host, () => {
    console.log(`App is started on ${host}:${port}`);
  });

  return app;
}

function createAppContext(config: RuntimeConfig) {
  return {
    dbConn: createDbConn(config.dbConnUrl, {
      schema: config.dbSchema,
    }),
    config: config,
  };
}

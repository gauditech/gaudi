import express from "express";

import { RuntimeConfig } from "@runtime/config";
import { useGaudi } from "@runtime/server/express";

export function createServer(config: RuntimeConfig) {
  const app = express();

  app.use(useGaudi(config));

  const server = app.listen(config.port, config.host, () => {
    console.log(`App is started on ${config.host}:${config.port}`);
  });

  return server;
}

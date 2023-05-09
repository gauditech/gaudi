#!/usr/bin/env node

// import this file only with relative path because this file actually configures path aliases (eg @src, ...)
import "../common/setupAliases";

import { loadDefinition, readConfig } from "@src/runtime/config.js";
import { createServer } from "@src/runtime/server/server.js";

// read environment
const config = readConfig();

const definition = loadDefinition(config.definitionPath);

(async () => {
  // start server
  createServer(definition, config);
})();

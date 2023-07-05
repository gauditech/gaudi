#!/usr/bin/env node

// import this file only with relative path because this file actually configures path aliases (eg @src, ...)
import "../common/setupAliases";

import { loadDefinition, readConfig } from "@runtime/config";
import { createServer } from "@runtime/server/server";

// read environment
const config = readConfig();

const definition = loadDefinition(config.definitionPath);

(async () => {
  // start server
  createServer(definition, config);
})();

#!/usr/bin/env node

import { loadDefinition, readConfig } from "@runtime/config";
import { createServer } from "@runtime/server/server";

// read environment
const config = readConfig();

const definition = loadDefinition(config.definitionPath);

(async () => {
  // start server
  createServer(definition, config);
})();

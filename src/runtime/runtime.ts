#!/usr/bin/env node

// import this file only with relative path because this file actually configures path aliases (eg @src, ...)
import "../common/setupAliases";

import { loadDefinition, readConfig } from "@src/runtime/config";
import { createServer } from "@src/runtime/server/server";

// read environment
const config = readConfig();

const definition = loadDefinition(config.definitionPath);

// start server
createServer(definition, config);

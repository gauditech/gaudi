#!/usr/bin/env node

import { readConfig } from "@runtime/config";
import { createServer } from "@runtime/server/server";

// read environment
const config = readConfig();

(async () => {
  // start server
  createServer(config);
})();

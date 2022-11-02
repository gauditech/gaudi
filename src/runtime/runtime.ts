import fs from "fs";

// import this file only with relative path because this file actually configures path aliases (eg @src, ...)
import "../common/setupAliases";

import { readConfig } from "@src/runtime/config";
import { createServer as setupServer } from "@src/runtime/server/server";

// read environment
const { host, port, definitionPath } = readConfig();

// --- read input file
if (!fs.existsSync(definitionPath)) {
  throw new Error(`Definition file not found: "${definitionPath}"`);
}
const definitionStr = fs.readFileSync(definitionPath).toString("utf-8");
const definition = JSON.parse(definitionStr);

// start server
setupServer({ host, port, definition });

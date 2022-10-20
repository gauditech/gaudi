import fs from "fs";

// import this file only with relative path because this file actually configures path aliasaes (eg @src, ...)
import "../common/setupAliases";

import { createServer as setupServer } from "@src/runtime/server/server";

const host = "127.0.0.1";
const port = 3001; // TODO: read port from env
const definitionPath = process.env.GAUDI_IN || "";

if (!fs.existsSync(definitionPath)) {
  throw `Definition file not found: "${definitionPath}"`;
}

const definitionStr = fs.readFileSync(definitionPath).toString("utf-8");
const definition = JSON.parse(definitionStr);
//
setupServer({ host, port, definition });

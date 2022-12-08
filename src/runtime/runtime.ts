// import this file only with relative path because this file actually configures path aliases (eg @src, ...)
import "../common/setupAliases";

import { loadDefinition, readConfig } from "@src/runtime/config";
import { importHooks } from "@src/runtime/hooks";
import { createServer } from "@src/runtime/server/server";

// read environment
const config = readConfig();

const definition = loadDefinition(config.definitionPath);

(async () => {
  // wait for hooks to import, then start server
  await importHooks(config.hookFolder);

  // start server
  createServer(definition, config);
})();

import path from "path";

import { buildApiClients } from "@src/builder/builder";
import { compile } from "@src/compiler/compiler";
import { compose } from "@src/composer/composer";
import { loadBlueprint } from "@src/e2e/api/setup";
import { Logger } from "@src/logger";
import { parse } from "@src/parser/parser";

const CLIENT_LIB_DIST_FOLDER = path.join(__dirname, "__snapshots__");

const logger = Logger.specific("test:e2e:client");

// NOTE: this file is executed once for EACH of the test files
// this is not optimal, but clients are not recreated if template hasn't changed
// so multiple executions of this file shouldn't cause too much performance issues

/**
 * Build API client lib files that are used in these tests
 *
 * It's important to build these files outside of tests because otherwise they would depend on each other
 * and if one of them is broken none of them would get rebuilt.
 */
async function setupTests() {
  logger.info("Building API clients");

  // --- API model client (uses model from `src/e2e/api/api.model.gaudi)
  await setupClient("apiClient", "../api/api.model.gaudi");

  // --- mock client (uses model from `src/e2e/client/mockClient.model.gaudi)
  await setupClient("mockClient", "./mockClient.model.gaudi");

  // --- auth model client (uses model from `src/e2e/api/auth.model.gaudi)
  await setupClient("authClient", "../api/auth.model.gaudi");
}

async function setupClient(name: string, bpPath: string) {
  const clientDest = path.join(CLIENT_LIB_DIST_FOLDER, name);

  logger.info(`Building client "${name}"`);

  const bp = loadBlueprint(path.join(__dirname, bpPath));
  const definition = compose(compile(parse(bp)));

  // build and output client lib
  await buildApiClients(definition, clientDest);
}

// current Jest TS setup doesn't work with ESM exports so we have to export it using CJS syntax
module.exports = setupTests;

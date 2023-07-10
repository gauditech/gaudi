import path from "path";

import { buildApiClients } from "@gaudi/compiler/dist/builder/builder";
import { Logger } from "@gaudi/compiler/dist/common/logger";

import { compileFromString } from "@runtime/common/testUtils";
import { loadBlueprint } from "@runtime/e2e/api/setup";

const CLIENT_LIB_DIST_FOLDER = path.join(__dirname, "__snapshots__");

const logger = Logger.specific("test:e2e:client");

/**
 * Build API client lib files that are used in these tests
 *
 * It's important to build these files outside of tests because otherwise they would depend on each other
 * and if one of them is broken none of them would get rebuilt.
 */
async function setupTests() {
  logger.info("Building API clients");

  // --- API model client (uses model from `src/e2e/api/api.model.gaudi)
  await setupClient("apiClient", "../api/api.model.gaudi", true);

  // --- mock client (uses model from `src/e2e/client/mockClient.model.gaudi)
  // these clients are created in a folder defined in blueprint (that's why this name is different)
  await setupClient("mock-client", "./mockClient.model.gaudi");

  // --- auth model client (uses model from `src/e2e/api/auth.model.gaudi)
  await setupClient("authClient", "../api/auth.model.gaudi", true);
}

async function setupClient(name: string, bpPath: string, appendGenerators = false) {
  const clientDest = path.join(CLIENT_LIB_DIST_FOLDER, name);

  logger.info(`    building client "${name}"`);

  let bp = loadBlueprint(path.join(__dirname, bpPath));
  if (appendGenerators) {
    bp = appendClientGenerator(bp);
  }
  const definition = compileFromString(bp);

  // build and output client lib
  await buildApiClients(definition, clientDest);
}

/** External blueprints don't have client generators so we'll add them here. */
function appendClientGenerator(bp: string) {
  return `
generate client {
  target ts
}

generate client {
  target js
}

${bp}
`;
}

// current Jest TS setup doesn't work with ESM exports so we have to export it using CJS syntax
module.exports = setupTests;

import path from "path";

import { initLogger } from "@gaudi/compiler";
import { buildApiClients } from "@gaudi/compiler/dist/builder/builder";

import { compileFromString } from "@runtime/common/testUtils";
import { loadBlueprint } from "@runtime/e2e/api/setup";

const logger = initLogger("gaudi:test:e2e:client");
const CLIENT_LIB_DIST_DIRECTORY = path.join(__dirname, "__snapshots__");

/**
 * Build API client lib files that are used in these tests
 *
 * It's important to build these files outside of tests because otherwise they would depend on each other
 * and if one of them is broken none of them would get rebuilt.
 */
async function setupTests() {
  logger.debug("Building API clients");

  // --- API model client (uses model from `src/e2e/api/api.model.gaudi)
  await setupClient("apiClient", "../api/api.model.gaudi", true);

  // --- mock client (uses model from `src/e2e/client/mockClient.model.gaudi)
  // these clients are created in a directory defined in blueprint (that's why this name is different)
  await setupClient("mock-client", "./mockClient.model.gaudi");
}

async function setupClient(name: string, bpPath: string, appendGenerators = false) {
  const clientDest = path.join(CLIENT_LIB_DIST_DIRECTORY, name);

  logger.debug(`    building client "${name}"`);

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
generator client {
  target ts
}

generator client {
  target js
}

${bp}
`;
}

// current Jest TS setup doesn't work with ESM exports so we have to export it using CJS syntax
module.exports = setupTests;

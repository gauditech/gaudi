import path from "path";

import { buildApiClients } from "../../builder/builder";
import { compile } from "../../compiler/compiler";
import { compose } from "../../composer/composer";
import { parse } from "../../parser/parser";

import { loadBlueprint } from "@src/e2e/api/setup";
import { Logger } from "@src/logger";

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
  await setupClient("apiClient", "../api/api.model.gaudi");

  // --- API model client (uses model from `src/e2e/client/mockClient.model.gaudi)
  await setupClient("mockClient", "./mockClient.model.gaudi");

  logger.info("API clients created");
}

async function setupClient(name: string, bpPath: string) {
  const bp = loadBlueprint(path.join(__dirname, bpPath));
  const definition = compose(compile(parse(bp)));

  // build and output client lib to `./data` folder
  await buildApiClients(definition, path.join(CLIENT_LIB_DIST_FOLDER, name));
}

// current Jest TS setup doesn't work with ESM exports so we have to export it using CJS syntax
module.exports = setupTests;

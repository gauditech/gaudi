import { initLogger } from "@gaudi/compiler";
import { EngineConfig } from "@gaudi/compiler/dist/config";
import _ from "lodash";

import { createCommandRunner } from "@cli/runner";

const logger = initLogger("gaudi:cli");

// --- compile

export function compile(_config: EngineConfig) {
  logger.debug("Compiling Gaudi code ...");

  return createCommandRunner("npx", ["gaudi-compiler"]);
}

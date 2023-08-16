import { initLogger } from "@gaudi/compiler";
import { EngineConfig } from "@gaudi/compiler/dist/config";
import _ from "lodash";

import { GAUDI_SCRIPTS, getDefaultNodeOptions } from "@cli/config";
import { createCommandRunner } from "@cli/runner";
import { makeCliSafePath } from "@cli/utils";

const logger = initLogger("gaudi:cli");

// --- compile

export function compile(_config: EngineConfig) {
  logger.debug("Compiling Gaudi code ...");

  return createCommandRunner("node", [
    ...getDefaultNodeOptions(),
    makeCliSafePath(GAUDI_SCRIPTS.COMPILER),
  ]);
}

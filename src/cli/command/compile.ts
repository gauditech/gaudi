import _ from "lodash";

import { GAUDI_SCRIPTS, getDefaultNodeOptions } from "@src/cli/config";
import { createCommandRunner } from "@src/cli/runner";
import { EngineConfig } from "@src/config";

// --- compile

export function compile(_config: EngineConfig) {
  console.log("Compiling Gaudi blueprint ...");

  return createCommandRunner("node", [...getDefaultNodeOptions(), GAUDI_SCRIPTS.ENGINE]);
}

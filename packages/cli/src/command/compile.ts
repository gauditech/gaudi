import { EngineConfig } from "@gaudi/compiler/config";
import _ from "lodash";

import { GAUDI_SCRIPTS, getDefaultNodeOptions } from "@cli/config";
import { createCommandRunner } from "@cli/runner";

// --- compile

export function compile(_config: EngineConfig) {
  console.log("Compiling Gaudi blueprint ...");

  return createCommandRunner("node", [...getDefaultNodeOptions(), GAUDI_SCRIPTS.ENGINE]);
}

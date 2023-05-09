import _ from "lodash";
import { Arguments } from "yargs";

import { GAUDI_SCRIPTS, getDefaultNodeOptions } from "@src/cli/config.js";
import { createCommandRunner } from "@src/cli/runner.js";
import { EngineConfig } from "@src/config.js";

// --- compile

export function compile(_args: Arguments, _config: EngineConfig) {
  console.log("Compiling Gaudi blueprint ...");

  return createCommandRunner("node", [...getDefaultNodeOptions(), GAUDI_SCRIPTS.ENGINE]);
}

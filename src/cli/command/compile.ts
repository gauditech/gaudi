import _ from "lodash";
import { ArgumentsCamelCase } from "yargs";

import { GAUDI_SCRIPTS, getDefaultNodeOptions } from "@src/cli/config";
import { createCommandRunner } from "@src/cli/runner";
import { EngineConfig } from "@src/config";

// --- compile

export function compile(_args: ArgumentsCamelCase, _config: EngineConfig) {
  console.log("Compiling Gaudi blueprint ...");

  return createCommandRunner("node", [...getDefaultNodeOptions(), GAUDI_SCRIPTS.ENGINE]);
}

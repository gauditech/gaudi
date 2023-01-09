import _ from "lodash";
import { ArgumentsCamelCase } from "yargs";

import { GAUDI_SCRIPTS, getDefaultNodeOptions } from "@src/cli/config";
import { createCommandRunner } from "@src/cli/runner";
import { EngineConfig } from "@src/config";

// --- server commands

export function start(_args: ArgumentsCamelCase, _config: EngineConfig) {
  console.log("Starting Gaudi project ...");

  // use `nodemon` to control (start, reload, shotdown) runtime process
  return createCommandRunner("nodemon", [
    ...getDefaultNodeOptions(),
    "--watch",
    "false",
    GAUDI_SCRIPTS.RUNTIME,
  ]);
}

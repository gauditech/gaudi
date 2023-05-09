import _ from "lodash";
import { Arguments } from "yargs";

import { GAUDI_SCRIPTS, appendBinPath, getDefaultNodeOptions } from "@src/cli/config.js";
import { createCommandRunner } from "@src/cli/runner.js";
import { EngineConfig } from "@src/config.js";

// --- server commands

export function start(_args: Arguments, _config: EngineConfig) {
  console.log("Starting Gaudi project ... ", process.cwd());

  // use `nodemon` to control (start, reload, shutdown) runtime process
  return createCommandRunner(appendBinPath("nodemon"), [
    ...getDefaultNodeOptions(),
    "--watch",
    "false",
    GAUDI_SCRIPTS.RUNTIME,
  ]);
}

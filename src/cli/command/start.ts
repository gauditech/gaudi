import _ from "lodash";
import { ArgumentsCamelCase } from "yargs";

import { GAUDI_SCRIPTS, appendBinPath, getDefaultNodeOptions } from "@src/cli/config";
import { createCommandRunner } from "@src/cli/runner";
import { EngineConfig } from "@src/config";

// --- server commands

export function start(_args: ArgumentsCamelCase, _config: EngineConfig) {
  console.log("Starting Gaudi project ... ", process.cwd());

  // use `nodemon` to control (start, reload, shutdown) runtime process
  return createCommandRunner(appendBinPath("nodemon"), [
    ...getDefaultNodeOptions(),
    "--watch",
    "false",
    GAUDI_SCRIPTS.RUNTIME,
  ]);
}

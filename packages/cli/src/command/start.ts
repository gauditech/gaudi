import { EngineConfig } from "@gaudi/compiler/config";
import * as dotenv from "dotenv";
import _ from "lodash";

import { GAUDI_SCRIPTS, getDefaultNodeOptions } from "@cli/config";
import { createCommandRunner } from "@cli/runner";

export function start(_config: EngineConfig) {
  console.log("Starting Gaudi project ... ", process.cwd());

  dotenv.config();

  // use `nodemon` to control (start, reload, shutdown) runtime process
  return createCommandRunner("npx", [
    "nodemon",
    ...getDefaultNodeOptions(),
    "--watch",
    "false",
    GAUDI_SCRIPTS.RUNTIME,
  ]);
}

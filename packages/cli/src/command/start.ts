import { EngineConfig } from "@gaudi/compiler/dist/config";
import * as dotenv from "dotenv";
import _ from "lodash";

import { GAUDI_SCRIPTS, getDefaultNodeOptions } from "@cli/config";
import { createCommandRunner } from "@cli/runner";
import { makeCliSafePath } from "@cli/utils";

export function start(_config: EngineConfig) {
  console.log("Starting Gaudi project ... ", process.cwd());

  dotenv.config();

  // use `nodemon` to control (start, reload, shutdown) runtime process
  return createCommandRunner("npx", [
    "nodemon",
    ...getDefaultNodeOptions(),
    "--watch",
    "false",
    makeCliSafePath(GAUDI_SCRIPTS.RUNTIME),
  ]);
}

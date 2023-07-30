import { EngineConfig } from "@gaudi/compiler/dist/config";
import * as dotenv from "dotenv";
import _ from "lodash";

import { createCommandRunner } from "@cli/runner";

export function start(_config: EngineConfig) {
  console.log("Starting Gaudi project ... ", process.cwd());

  dotenv.config();

  // use `nodemon` to control (start, reload, shutdown) runtime process
  return createCommandRunner("npx", ["nodemon", "--watch", "false", "npx gaudi-runtime"]);
}

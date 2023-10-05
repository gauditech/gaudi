import { initLogger } from "@gaudi/compiler";
import { EngineConfig } from "@gaudi/compiler/dist/config";
import * as dotenv from "dotenv";
import _ from "lodash";

import { CommandRunner, createCommandRunner } from "@cli/runner";

const logger = initLogger("gaudi:cli:start");

export function start(_config: EngineConfig): CommandRunner {
  logger.debug("Starting Gaudi project ... ", process.cwd());

  dotenv.config();

  // using nodemon only to handle runtime errors
  // nodmeon doesn't watch files because we have our own command pipeline
  return createCommandRunner("nodemon", [
    // ignore everything, gaudi watcher will restart nodemon
    "--ignore",
    "'*'",
    // all extensions
    "--ext",
    "'*'",
    // keep quiet
    "--quiet",
    // exec gaudi runtime
    "--exec",
    "node ./dist/server.js",
  ]);
}

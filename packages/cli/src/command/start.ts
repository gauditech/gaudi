import fs from "fs";
import path from "path";

import { initLogger } from "@gaudi/compiler";
import { EngineConfig } from "@gaudi/compiler/dist/config";
import * as dotenv from "dotenv";
import _ from "lodash";

import { CommandRunner, createCommandRunner } from "@cli/runner";

const logger = initLogger("gaudi:cli:start");

export type StartCommandConfig = {
  runtimePath?: string;
};

export function start(
  commandConfig: StartCommandConfig,
  _engineConfig: EngineConfig
): CommandRunner {
  logger.debug("Starting Gaudi project ... ");

  dotenv.config();

  let commandScript;
  // custom runtime server
  if (commandConfig.runtimePath) {
    const runtimePath = path.resolve(commandConfig.runtimePath);
    if (!fs.existsSync(runtimePath) || !fs.lstatSync(runtimePath).isFile()) {
      throw new Error(`Runtime path file does not exist: "${runtimePath}"`);
    }

    commandScript = `node "${commandConfig.runtimePath}"`;
  }
  // integrated runtime server
  else {
    commandScript = `npx gaudi-runtime`;
  }
  logger.debug(`Runtime server command: "${commandScript}"`);

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
    // "npx gaudi-runtime",
    commandScript,
  ]);
}

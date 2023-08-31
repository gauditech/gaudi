import path from "path";

import { initLogger } from "@gaudi/compiler";
import { EngineConfig } from "@gaudi/compiler/dist/config";
import copyfiles from "copyfiles";
import _ from "lodash";

const logger = initLogger("gaudi:cli");

// --- copy static

export function copyStatic(config: EngineConfig) {
  logger.debug("Copying static resources ...");

  return new Promise((resolve, reject) => {
    copyfiles(
      [path.join(config.gaudiFolder, "db", "**"), config.outputFolder],
      { up: -1, verbose: true, error: true },
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(err);
        }
      }
    );
  });
}

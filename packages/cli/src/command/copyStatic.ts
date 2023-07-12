import path from "path";

import { EngineConfig } from "@gaudi/compiler/dist/config";
import copyfiles from "copyfiles";
import _ from "lodash";

// --- copy static

export function copyStatic(config: EngineConfig) {
  console.log("Copying static resources ...");

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

import path from "path";

import copyfiles from "copyfiles";
import _ from "lodash";
import { ArgumentsCamelCase } from "yargs";

import { EngineConfig } from "@src/config";

// --- copy static

export function copyStatic(_args: ArgumentsCamelCase, config: EngineConfig) {
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

import { EngineConfig } from "@gaudi/compiler/dist/config";
import * as dotenv from "dotenv";
import _ from "lodash";
import nodemon from "nodemon";

import { CommandRunner } from "@cli/runner";

export function start(_config: EngineConfig): CommandRunner {
  console.log("Starting Gaudi project ... ", process.cwd());

  dotenv.config();

  let p: typeof nodemon | undefined;
  const nodemonOpts: nodemon.Settings = {
    // ignoring everything we disable nodemon's watch mechanism but still can use "restart" command
    // make sure "*" is wrapped in quotes to prevent it being replaced by shell
    ignore: ["*"],
    // runtime script
    exec: `npx gaudi-runtime`,
  };
  let isRunning = false;

  return {
    start: () => {
      return new Promise((resolve, reject) => {
        try {
          console.log(`Starting "nodemon" ${JSON.stringify(nodemonOpts)}`);

          p = nodemon(nodemonOpts);

          p.on("start", () => {
            isRunning = true;

            // short running commands report exit code, but since this is a long running command
            // we can pretend that everything went well and repor `0`
            resolve(0);
          });
          p.on("exit", () => {
            if (!isRunning) {
              // if not yet running we'll treat it as a startup failure
              reject();
            }
            isRunning = false;
          });

          p.on("crash", (err) => {
            if (!isRunning) {
              // if not yet running we'll treat it as a startup failure
              reject(err);
            }
            isRunning = false;
          });
        } catch (err) {
          reject(err);
          isRunning = false;
        }
      });
    },
    stop: () => {
      if (p == null) {
        throw "Nodemon process not initialized. Did you call `start()`?";
      }

      p.emit("quit");
      return true;
    },
    sendMessage: (message: string) => {
      if (p == null) {
        return Promise.reject("Nodemon process not initialized. Did you call `start()`?");
      }

      console.log("Sending message to child process: ", message);

      p.emit(message);
    },
    sendSignal: (_signal: NodeJS.Signals) => {
      throw "Sending signals to nodemon process is not supported";
    },
    isRunning: () => isRunning,
  };
}

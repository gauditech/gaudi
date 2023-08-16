import { initLogger } from "@gaudi/compiler";
import chokidar, { WatchOptions } from "chokidar";
import _ from "lodash";

import { RESOURCE_WATCH_DELAY } from "@cli/config";
import { Controllable } from "@cli/types";

const logger = initLogger("gaudi:cli");

// -------------------- Resource file watcher

type ResourceWatcherOptions = { debounce?: number } & WatchOptions;

export function watchResources(
  target: string | string[],
  callback: () => Promise<void>,
  options?: ResourceWatcherOptions
): Controllable {
  const {
    /* custom options */
    debounce,
    /* chokidar options */
    ...watcherOptions
  } = options ?? {};

  // prevent event flood
  const debouncedCallback = _.debounce(callback, debounce ?? RESOURCE_WATCH_DELAY);

  let watcher: chokidar.FSWatcher | undefined;

  const instance = {
    start: () => {
      return new Promise<void>((resolve, reject) => {
        try {
          watcher = chokidar
            .watch(target, { ...watcherOptions /* add default options */ })
            // file listeners
            .on("add", debouncedCallback)
            .on("change", debouncedCallback)
            .on("unlink", debouncedCallback)
            // folder listeners
            .on("addDir", debouncedCallback)
            .on("unlinkDir", debouncedCallback)
            // attached all listeners
            .on("ready", () => {
              resolve();
            })
            .on("error", (err) => {
              // reject promise
              logger.error("Resource watcher error", err);
              reject(err);
            });
        } catch (err) {
          reject(err);
        }
      });
    },
    stop: () => {
      if (watcher != null) {
        return watcher.close();
      } else {
        logger.error("Resource watcher: cannot stop empty watcher");

        return Promise.resolve();
      }
    },
  };

  return instance;
}

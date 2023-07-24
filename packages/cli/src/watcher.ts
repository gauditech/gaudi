import chokidar, { WatchOptions } from "chokidar";
import _ from "lodash";

import { RESOURCE_WATCH_DELAY } from "@cli/config";
import { Controllable } from "@cli/types";

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
      let initialized = false;
      let promiseResolve: ((_: void) => void) | undefined;
      let promiseReject: ((err: unknown) => void) | undefined;

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
          initialized = true;
          // resolve promise
          if (promiseResolve) {
            promiseResolve();
          } else {
            console.warn("Resource watcher: promise resolve not ready");
          }
        })
        .on("error", (err) => {
          // reject promise
          console.error("Resource watcher error", err);
          if (!initialized) {
            if (promiseReject) {
              promiseReject(err);
            } else {
              console.warn("Resource watcher: promise reject not ready");
            }
          }
        });

      return new Promise<void>((resolve, reject) => {
        // expose promise's internals so it can be controlled by chokidar's events
        promiseResolve = resolve;
        promiseReject = reject;
      });
    },
    stop: () => {
      if (watcher != null) {
        return watcher.close();
      } else {
        console.warn("Resource watcher: cannot stop empty watcher");

        return Promise.resolve();
      }
    },
  };

  return instance;
}

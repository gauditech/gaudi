import chokidar, { WatchOptions } from "chokidar";
import _ from "lodash";

import { RESOURCE_WATCH_DELAY } from "@src/cli/config.js";
import { Stoppable } from "@src/cli/types.js";

// -------------------- Resource file watcher

type ResourceWatcherOptions = { debounce?: number } & WatchOptions;

export function watchResources(
  target: string | string[],
  callback: () => Promise<void>,
  options?: ResourceWatcherOptions
): Stoppable {
  const {
    /* custom options */
    debounce,
    /* chokidar options */
    ...watcherOptions
  } = options ?? {};

  // prevent event flood
  const debouncedCallback = _.debounce(callback, debounce ?? RESOURCE_WATCH_DELAY);

  const watcher = chokidar
    .watch(target, { ...watcherOptions /* add default options */ })
    // file listeners
    .on("add", debouncedCallback)
    .on("change", debouncedCallback)
    .on("unlink", debouncedCallback)
    // folder listeners
    .on("addDir", debouncedCallback)
    .on("unlinkDir", debouncedCallback)
    // attached all listeners
    .on("ready", debouncedCallback);

  return {
    stop: () => {
      return watcher.close();
    },
  };
}

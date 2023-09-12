import { EngineConfig } from "@gaudi/compiler/dist/config";

// -------------------- Various configs, constants and defaults

/**
 * Time to wait before reporting resource watcher changes (in millis).
 *
 * This allows basic debouncing (eg. when creating/updating multiple files at once).
 */
export const RESOURCE_WATCH_DELAY = 500;

/** Returns path to prisma schema file */
export function getDbSchemaPath(config: EngineConfig): string {
  return `${config.gaudiDirectory}/db/schema.prisma`;
}

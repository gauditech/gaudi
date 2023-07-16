import path from "path";

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
  return `${config.gaudiFolder}/db/schema.prisma`;
}

// defaul Node options
const DEFAULT_NODE_OPTIONS = [
  // development node options - maybe we should allow disabling them in production?
  "--enable-source-maps",
  "--stack-trace-limit=30",
  "--stack-size=2048",
];

/**
 * Default node options
 *
 * Additional node options can be passed via NODE_OPTIONS env var which is included when running commands
 */
export function getDefaultNodeOptions(): string[] {
  return [...DEFAULT_NODE_OPTIONS];
}

/**
 * Paths to Gaudi scripts
 *
 * Target Gaudi scripts directly instead of via NPX because we cannot pass some node options through NPX (via --node-options")
 *
 * See a list of options allowed in --node-options here: https://nodejs.org/docs/latest-v16.x/api/cli.html#node_optionsoptions
 *
 * Make paths relative to CWD to get shorter paths
 */
export const GAUDI_SCRIPTS = {
  COMPILER: path.relative(process.cwd(), path.resolve(__dirname, "../../@gaudi/compiler")),
  RUNTIME: path.relative(process.cwd(), path.resolve(__dirname, "../../@gaudi/runtime")),
  POPULATOR: path.relative(
    process.cwd(),
    path.resolve(__dirname, "../../@gaudi/runtime/dist/populator/populator.js")
  ),
};
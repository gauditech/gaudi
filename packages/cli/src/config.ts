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

/**
 * Default Node options. Mostly development related
 *
 * If used with NPX, it has some constraints regarding allowed node options.
 * See a list of options allowed in `--node-options` here: https://nodejs.org/docs/latest-v16.x/api/cli.html#node_optionsoptions
 *
 * TODO: maybe we should allow disabling them in production?
 */
const DEFAULT_NODE_OPTIONS = [
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
 * Gaudi scripts
 *
 * If invoked via `node` use fs paths or binary names if invoked via `NPX`.
 *
 * NPX is better because it uses it's own resolution mechanism to find these scripts
 * regardless of project structure, symlinking, ... But NPX has some restraints regarding node options.
 * See `DEFAULT_NODE_OPTIONS` for more info.
 */
export const GAUDI_SCRIPTS = {
  COMPILER: path.resolve(__dirname, "../../@gaudi/compiler/dist/compiler-cli.js"),
  RUNTIME: path.resolve(__dirname, "../../@gaudi/runtime/dist/runtime-cli.js"),
  POPULATOR: path.resolve(__dirname, "../../@gaudi/runtime/dist/populator/populator.js"),
};

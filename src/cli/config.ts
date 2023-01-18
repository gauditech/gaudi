import path from "path";

import { EngineConfig } from "@src/config";

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
 * See a list of allowed options here: https://nodejs.org/docs/latest-v16.x/api/cli.html#node_optionsoptions
 */
export const GAUDI_SCRIPTS = {
  ENGINE: path.join(__dirname, "../engine.js"),
  RUNTIME: path.join(__dirname, "../runtime/runtime.js"),
  POPULATOR: path.join(__dirname, "../populator/populator.js"),
};

/**
 * Add path to CLI's binary.
 *
 * We don't want to force users to be aware of our binaries which means that
 * they probably won't be available as global binaries thus we have to manually
 * target them in our own `node_modules`.
 */
export function appendBinPath(binName: string): string {
  return path.join("./node_modules/@gaudi/engine/node_modules/.bin/", binName);
}

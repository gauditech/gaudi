import fs from "fs";

import { initLogger } from "@gaudi/compiler";
import { Definition } from "@gaudi/compiler/dist/types/definition";

const logger = initLogger("gaudi:runtime:config");
export type RuntimeConfig = AppConfig & {
  /** Runtime server host name */
  host: string;
  /** Runtime server port number */
  port: number;
};

export type AppConfig = {
  /** Path to "definition.json" file. */
  definitionPath: string;
  /** Directory where runtime should output generated files */
  outputDirectory: string;
  /** DB connection URL */
  dbConnUrl: string;
  /** CORS settings */
  cors?: {
    /**
     * CORS allowed origin.
     *
     * Read from env variable GAUDI_CORS_ORIGIN.
     *
     * Multiple values are separated by comma.
     *
     * If value equals `*` then `true` is used to allow `cors` middleware to allow any domain.
     * Using `*` as a header value is flaky so middleware will simply mirror incoming origin to allow all of them.
     *
     * E.g.
     * ```
     * # single value
     * GAUDI_CORS_ORIGIN=http://domain.example
     *
     * # multiple value
     * GAUDI_CORS_ORIGIN=http://domain.one.example,http://domain.two.example
     *
     * # allow all domains
     * GAUDI_CORS_ORIGIN=*
     * ```
     */
    origin?: string[] | boolean;
  };
};

/** Read runtime config from environment or provide default values. */
export function readConfig(): RuntimeConfig {
  const host = process.env.GAUDI_RUNTIME_SERVER_HOST ?? "127.0.0.1";
  const port =
    process.env.GAUDI_RUNTIME_SERVER_PORT != null
      ? parseInt(process.env.GAUDI_RUNTIME_SERVER_PORT, 10)
      : 3001;
  const definitionPath = process.env.GAUDI_RUNTIME_DEFINITION_PATH || "definition.json";
  const outputDirectory = process.env.GAUDI_RUNTIME_OUTPUT_PATH || ".";

  const dbConnUrl = process.env.GAUDI_DATABASE_URL || "";

  // CORS
  let cors: AppConfig["cors"] | undefined;
  // origin
  const corsOrigin =
    process.env.GAUDI_CORS_ORIGIN === "*"
      ? true
      : process.env.GAUDI_CORS_ORIGIN?.split(",").map((o) => o.trim());
  if (corsOrigin) {
    cors = {
      origin: corsOrigin,
    };
  }

  const finalConfig = { host, port, definitionPath, outputDirectory, dbConnUrl, cors };

  logger.debug("Gaudi runtime config", finalConfig);

  return finalConfig;
}

/** Load definition file and return it's content */
export function loadDefinition(definitionPath: string): Definition {
  // --- read input file
  if (!fs.existsSync(definitionPath)) {
    throw new Error(`Definition file not found: "${definitionPath}"`);
  }
  const definitionStr = fs.readFileSync(definitionPath).toString("utf-8");
  return JSON.parse(definitionStr);
}

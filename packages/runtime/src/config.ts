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
  outputFolder: string;
  /** DB connection URL */
  dbConnUrl: string;
  /** DB default schema */
  dbSchema?: string;
};

/** Read runtime config from environment or provide default values. */
export function readConfig(): RuntimeConfig {
  const host = process.env.GAUDI_RUNTIME_SERVER_HOST ?? "127.0.0.1";
  const port =
    process.env.GAUDI_RUNTIME_SERVER_PORT != null
      ? parseInt(process.env.GAUDI_RUNTIME_SERVER_PORT, 10)
      : 3001;
  const definitionPath = process.env.GAUDI_RUNTIME_DEFINITION_PATH || "definition.json";
  const outputFolder = process.env.GAUDI_RUNTIME_OUTPUT_PATH || ".";

  const dbConnUrl = process.env.GAUDI_DATABASE_URL || "";
  const dbSchema = process.env.GAUDI_DATABASE_SCHEMA || "public";

  const finalConfig = { host, port, definitionPath, outputFolder, dbConnUrl, dbSchema };

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

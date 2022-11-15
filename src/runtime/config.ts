import fs from "fs";

import { initializeContext } from "@src/runtime/server/context";
import { createDbConn } from "@src/runtime/server/dbConn";
import { Definition } from "@src/types/definition";

export type RuntimeConfig = {
  /** Runtime server host name */
  host: string;
  /** Runtime server port number */
  port: number;
  /** Path to generated definition.json file. */
  definitionPath: string;
  /** Folder where runtime should output generated files */
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
  const dbSchema = process.env.GAUDI_DATABASE_SCHEMA;

  return { host, port, definitionPath, outputFolder, dbConnUrl, dbSchema };
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

export function createAppContext(config: RuntimeConfig) {
  initializeContext({
    dbConn: createDbConn(config.dbConnUrl, {
      schema: config.dbSchema,
    }),
    config: config,
  });
}

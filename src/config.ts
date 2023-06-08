import dotenv from "dotenv";
import { ConnectionOptions } from "pg-connection-string";

import { parseConnectionString } from "./common/utils";

import { GAUDI_FOLDER_NAME } from "@src/const";

export type EngineConfig = {
  /** Path to Gaudi blueprint file */
  inputPath: string;
  /** Folder where runtime should output generated files */
  outputFolder: string;
  /** Gaudi folder */
  gaudiFolder: string;
  dbConn: {
    host: string;
    port: number;
    database: string;
    user: string;
    password?: string;
  };
  embeddedPg: boolean;
};

/** Read runtime config from environment or provide default values. */
export function readConfig(configPath?: string): EngineConfig {
  dotenv.config({ path: configPath });

  const inputPath = process.env.GAUDI_ENGINE_INPUT_PATH ?? "";
  const outputFolder = process.env.GAUDI_ENGINE_OUTPUT_PATH ?? ".";
  // gaudi folder's path should probably be determined by the position of (future) gaudi config file
  const gaudiFolder = `./${GAUDI_FOLDER_NAME}`;

  const conn = parseConnectionString(process.env.GAUDI_DATABASE_URL);
  const dbConn: EngineConfig["dbConn"] = {
    database: conn.database ?? "gaudiapp",
    host: conn.host ?? "localhost",
    port: (conn.port && parseInt(conn.port, 10)) || 5432,
    user: conn.user || "postgres",
    password: conn.password,
  };
  const embeddedPg = process.env.GAUDI_EMBEDDED_POSTGRESQL_ENABLED?.toLowerCase() === "true";

  return { inputPath, outputFolder, gaudiFolder, dbConn, embeddedPg };
}

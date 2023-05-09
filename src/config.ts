import dotenv from "dotenv";

import { GAUDI_FOLDER_NAME } from "@src/const.js";

export type EngineConfig = {
  /** Path to Gaudi blueprint file */
  inputPath: string;
  /** Folder where runtime should output generated files */
  outputFolder: string;
  /** Gaudi folder */
  gaudiFolder: string;
};

/** Read runtime config from environment or provide default values. */
export function readConfig(configPath?: string): EngineConfig {
  dotenv.config({ path: configPath });

  const inputPath = process.env.GAUDI_ENGINE_INPUT_PATH ?? "";
  const outputFolder = process.env.GAUDI_ENGINE_OUTPUT_PATH ?? ".";
  // gaudi folder's path should probably be determined by the position of (future) gaudi config file
  const gaudiFolder = `./${GAUDI_FOLDER_NAME}`;

  return { inputPath, outputFolder, gaudiFolder };
}

import fs from "fs";
import path from "path";

import { cosmiconfigSync } from "cosmiconfig";

export type EngineConfig = {
  /** Path to Gaudi blueprint folder */
  inputFolder: string;
  /** Folder where runtime should output generated files */
  outputFolder: string;
  /** Gaudi folder */
  gaudiFolder: string;
  /** Location of the loaded config file */
  configFile: string;
};

/** Name of folder where Gaudi stores generated files that need to be source controlled (eg. DB migration files) */
export const GAUDI_FOLDER_NAME = "gaudi";

/** Read runtime config from environment or provide default values. */
export function readConfig(configPath?: string): EngineConfig {
  const explorer = cosmiconfigSync("gaudi", {
    searchPlaces: ["gaudiconfig.json", "gaudiconfig.yaml"],
  });
  let result;
  if (configPath && fs.statSync(configPath).isFile()) {
    result = explorer.load(configPath);
  } else {
    result = explorer.search(configPath);
  }
  if (!result) {
    throw new Error(
      `Failed to find a gaudiconfig.json or gaudiconfig.yaml in ${process.cwd()} or any of it's parents.`
    );
  }
  const projectRoot = path.dirname(result.filepath);
  const config = result.config;

  const inputFolder = path.resolve(projectRoot, config?.rootDir ?? "");
  const outputFolder = path.resolve(projectRoot, config?.outDir ?? "");
  // gaudi folder's path should probably be determined by the position of (future) gaudi config file
  const gaudiFolder = path.resolve(inputFolder, GAUDI_FOLDER_NAME);

  const finalConfig = { inputFolder, outputFolder, gaudiFolder, configFile: result.filepath };

  console.log("Gaudi engine config", finalConfig);

  return finalConfig;
}

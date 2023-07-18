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
  console.log(`Found Gaudi config: ${result.filepath}`);

  // Make paths relative to CWD to get shorter paths
  const projectRoot = path.relative(process.cwd(), path.dirname(result.filepath));
  const configFile = path.join(projectRoot, path.basename(result.filepath));

  // read config
  const config = result.config;

  const inputFolder = path.join(projectRoot, config?.rootDir ?? "");
  const outputFolder = path.join(projectRoot, config?.outDir ?? "");
  // TODO: gaudi folder's path should probably be determined by the position of gaudi config file
  const gaudiFolder = path.join(inputFolder, GAUDI_FOLDER_NAME);

  const finalConfig = { inputFolder, outputFolder, gaudiFolder, configFile };

  console.log("Gaudi compiler config", finalConfig);

  return finalConfig;
}

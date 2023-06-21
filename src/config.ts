import path from "path";

import { cosmiconfigSync } from "cosmiconfig";

import { GAUDI_FOLDER_NAME } from "@src/const";

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
  const explorer = cosmiconfigSync("gaudi", {
    searchPlaces: ["gaudiconfig.json", "gaudiconfig.yaml"],
  });
  let result;
  if (configPath) {
    result = explorer.load(configPath);
  } else {
    result = explorer.search();
  }
  if (!result) {
    throw new Error(
      `Failed to find a gaudiconfig.json or gaudiconfig.yaml in ${process.cwd()} or any of it's parents.`
    );
  }
  const projectRoot = path.dirname(result.filepath);
  const config = result.config;

  const inputPath = path.resolve(projectRoot, config?.rootDir ?? "");
  const outputFolder = path.resolve(projectRoot, config?.outDir ?? "");
  // gaudi folder's path should probably be determined by the position of (future) gaudi config file
  const gaudiFolder = path.resolve(projectRoot, GAUDI_FOLDER_NAME);

  return { inputPath, outputFolder, gaudiFolder };
}

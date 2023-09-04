import fs from "fs";
import path from "path";

import { cosmiconfigSync } from "cosmiconfig";

import { initLogger } from "./common/logger";

const logger = initLogger("gaudi:compiler");

export type EngineConfig = {
  /** Path to Gaudi blueprint directory */
  inputDirectory: string;
  /** Directory where runtime should output generated files */
  outputDirectory: string;
  /** Gaudi directory */
  gaudiDirectory: string;
  /** Location of the loaded config file */
  configFile: string;
};

/** Name of directory where Gaudi stores generated files that need to be source controlled (eg. DB migration files) */
export const GAUDI_DIRECTORY_NAME = "gaudi";

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
  logger.debug(`Found Gaudi config: ${result.filepath}`);

  // Make paths relative to CWD to get shorter paths
  const projectRoot = path.relative(process.cwd(), path.dirname(result.filepath));
  const configFile = path.join(projectRoot, path.basename(result.filepath));

  // read config
  const config = result.config;

  const inputDirectory = path.join(projectRoot, config?.rootDir ?? "");
  const outputDirectory = path.join(projectRoot, config?.outDir ?? "");
  // TODO: gaudi directory's path should probably be determined by the position of gaudi config file
  const gaudiDirectory = path.join(inputDirectory, GAUDI_DIRECTORY_NAME);

  const finalConfig = { inputDirectory, outputDirectory, gaudiDirectory, configFile };

  logger.debug("Gaudi compiler config", finalConfig);

  return finalConfig;
}

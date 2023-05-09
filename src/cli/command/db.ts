import _ from "lodash";
import { Arguments } from "yargs";

import {
  GAUDI_SCRIPTS,
  appendBinPath,
  getDbSchemaPath,
  getDefaultNodeOptions,
} from "@src/cli/config.js";
import { createCommandRunner } from "@src/cli/runner.js";
import { EngineConfig } from "@src/config.js";

// ---------- DB commands

// --- DB push

export function dbPush(_args: Arguments, config: EngineConfig) {
  console.log("Pushing DB change ...");

  return createCommandRunner(appendBinPath("prisma"), [
    "db",
    "push",
    "--accept-data-loss",
    "--skip-generate",
    `--schema=${getDbSchemaPath(config)}`,
  ]);
}

// --- DB reset

export function dbReset(_args: Arguments, config: EngineConfig) {
  console.log("Resetting DB ...");

  return createCommandRunner(appendBinPath("prisma"), [
    "db",
    "push",
    "--force-reset",
    "--skip-generate",
    `--schema=${getDbSchemaPath(config)}`,
  ]);
}

// --- DB populate

export type DbPopulateOptions = {
  /** Populator name */
  populator?: string;
};

export function dbPopulate(args: Arguments<DbPopulateOptions>, _config: EngineConfig) {
  const populatorName = args.populator!;

  if (_.isEmpty(populatorName)) throw "Populator name cannot be empty";

  console.log(`Populating DB using populator "${populatorName} ..."`);

  return createCommandRunner("node", [
    ...getDefaultNodeOptions(),
    GAUDI_SCRIPTS.POPULATOR,
    "-p",
    populatorName,
  ]);
}

// --- DB migrate

export type DbMigrateOptions = {
  name?: string;
};

export function dbMigrate(args: Arguments<DbMigrateOptions>, config: EngineConfig) {
  const migrationName = args.name;

  if (_.isEmpty(migrationName)) throw "Migration name cannot be empty";

  console.log(`Creating DB migration "${migrationName}" ...`);

  return createCommandRunner(appendBinPath("prisma"), [
    "migrate",
    "dev",
    `--name=${migrationName}`,
    `--schema=${getDbSchemaPath(config)}`,
  ]);
}

// --- DB deploy

export function dbDeploy(_args: Arguments<DbMigrateOptions>, config: EngineConfig) {
  console.log(`Deploying DB migrations ...`);

  return createCommandRunner(appendBinPath("prisma"), [
    "migrate",
    "deploy",
    `--schema=${getDbSchemaPath(config)}`,
  ]);
}

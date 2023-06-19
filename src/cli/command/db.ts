import _ from "lodash";
import { ArgumentsCamelCase } from "yargs";

import { GAUDI_SCRIPTS, getDbSchemaPath, getDefaultNodeOptions } from "@src/cli/config";
import { createCommandRunner } from "@src/cli/runner";
import { EngineConfig } from "@src/config";

// ---------- DB commands
// --- DB push
export function dbPush(config: EngineConfig) {
  console.log("Pushing DB change ...");

  return createCommandRunner("npx", [
    "prisma",
    "db",
    "push",
    "--accept-data-loss",
    "--skip-generate",
    `--schema=${getDbSchemaPath(config)}`,
  ]);
}

// --- DB reset

export function dbReset(config: EngineConfig) {
  console.log("Resetting DB ...");

  return createCommandRunner("npx", [
    "prisma",
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

export function dbPopulate(args: ArgumentsCamelCase<DbPopulateOptions>, _config: EngineConfig) {
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

export function dbMigrate(args: ArgumentsCamelCase<DbMigrateOptions>, config: EngineConfig) {
  const migrationName = args.name;

  if (_.isEmpty(migrationName)) throw "Migration name cannot be empty";

  console.log(`Creating DB migration "${migrationName}" ...`);

  return createCommandRunner("npx", [
    "prisma",
    "migrate",
    "dev",
    `--name=${migrationName}`,
    `--schema=${getDbSchemaPath(config)}`,
  ]);
}

// --- DB deploy

export function dbDeploy(_args: ArgumentsCamelCase<DbMigrateOptions>, config: EngineConfig) {
  console.log(`Deploying DB migrations ...`);

  return createCommandRunner("npx", [
    "prisma",
    "migrate",
    "deploy",
    `--schema=${getDbSchemaPath(config)}`,
  ]);
}

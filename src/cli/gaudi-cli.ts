#!/usr/bin/env node

// import this file only with relative path because this file actually configures path aliases (eg @src, ...)
import "../common/setupAliases";

import { spawn } from "child_process";

import _ from "lodash";
import yargs, { ArgumentsCamelCase } from "yargs";
import { hideBin } from "yargs/helpers";

import { EngineConfig, readConfig } from "@src/config";

const config = readConfig();

parseArguments(config);

function parseArguments(config: EngineConfig) {
  yargs(hideBin(process.argv))
    .scriptName("gaudi-cli")
    .command({
      command: "compile",
      describe: "Compile Gaudi source",
      handler: (args) => compileCommand(args, config),
    })
    .command({
      command: "run",
      describe: "Run Gaudi project",
      handler: (args) => runCommand(args, config),
    })
    .command({
      command: "db",
      describe: "Make changes to DB. This is a no-op grouping command. See help for details.",
      handler: () => {
        // handler is required but this a noop
      },
      builder: (yargs) =>
        yargs
          .command({
            command: "push",
            describe: "Push model changes to development database",
            handler: (args) => dbPushCommand(args, config),
          })
          .command({
            command: "reset",
            describe: "Reset DB",
            handler: (args) => dbResetCommand(args, config),
          })
          .command({
            command: "populate",
            describe: "Reset DB and populate it using populator",
            handler: (args) => dbPopulateCommand(args, config),
            builder: (yargs) =>
              yargs.option("populator", {
                alias: "p",
                type: "string",
                description: "Name of populator to use in population",
                demandOption: '  try adding: "--populator=<populator name>"',
              }),
          })
          .command({
            command: "migrate",
            builder: (yargs) =>
              yargs.option("name", {
                alias: "n",
                type: "string",
                description: "Name of migration to be created",
                demandOption: '  try adding "--name=<migration name>"',
              }),
            describe: "Create DB migration file",
            handler: (args) => dbMigrateCommand(args, config),
          })
          .command({
            command: "deploy",
            describe: "Deploy migrations to production database",
            handler: (args) => dbDeployCommand(args, config),
          })
          .demandCommand(),
    })

    .help()
    .alias("help", "h")
    .demandCommand()
    .strict()
    .parse();
}

function compileCommand(_args: ArgumentsCamelCase, _config: EngineConfig) {
  console.log("Compiling Gaudi source ...");

  executeCommand("npx", ['--node-options="--enable-source-maps"', "gaudi-engine"]);
}

function runCommand(_args: ArgumentsCamelCase, _config: EngineConfig) {
  console.log("Running Gaudi project ...");

  executeCommand("npx", ['--node-options="--enable-source-maps"', "gaudi-runtime"]);
}

function dbPushCommand(_args: ArgumentsCamelCase, config: EngineConfig) {
  console.log("Pushing DB change ...");

  executeCommand("npx", [
    "prisma",
    "db",
    "push",
    `--schema=${dbSchemaPath(config.gaudiFolder)}`,
    "--accept-data-loss",
  ]);
}

function dbResetCommand(args: ArgumentsCamelCase, config: EngineConfig) {
  console.log("Resetting DB ...");

  executeCommand("npx", [
    "prisma",
    "db",
    "push",
    "--force-reset",
    `--schema=${dbSchemaPath(config.gaudiFolder)}`,
  ]);
}

type DbPopulateOptions = {
  /** Populator name */
  populator?: string;
};

function dbPopulateCommand(args: ArgumentsCamelCase<DbPopulateOptions>, _config: EngineConfig) {
  const populatorName = args.populator!;

  if (_.isEmpty(populatorName)) throw "Populator name cannot be empty";

  console.log(`Populating DB using populator "${populatorName} ..."`);

  executeCommand("npx", ["gaudi-populator", "-p", populatorName]);
}

type DbMigrateOptions = {
  name?: string;
};
function dbMigrateCommand(args: ArgumentsCamelCase<DbMigrateOptions>, config: EngineConfig) {
  const migrationName = args.name;

  if (_.isEmpty(migrationName)) throw "Migration name cannot be empty";

  console.log(`Creating DB migration "${migrationName}" ...`);

  executeCommand("npx", [
    "prisma",
    "migrate",
    "dev",
    `--name=${migrationName}`,
    `--schema=${dbSchemaPath(config.gaudiFolder)}`,
  ]);
}

function dbDeployCommand(args: ArgumentsCamelCase<DbMigrateOptions>, config: EngineConfig) {
  console.log(`Deploying DB migrations ...`);

  executeCommand("npx", [
    "prisma",
    "migrate",
    "deploy",
    `--schema=${dbSchemaPath(config.gaudiFolder)}`,
  ]);
}

// ---------- utils

function executeCommand(command: string, argv: string[]) {
  spawn(command, argv, {
    env: {
      ...process.env,
    },
    stdio: "inherit",
  });
}

function dbSchemaPath(outputFolder: string): string {
  return `${outputFolder}/db/schema.prisma`;
}

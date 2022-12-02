#!/usr/bin/env node

// import this file only with relative path because this file actually configures path aliases (eg @src, ...)
import "../common/setupAliases";

import { spawn } from "child_process";

import yargs, { ArgumentsCamelCase } from "yargs";
import { hideBin } from "yargs/helpers";

import { RuntimeConfig, readConfig } from "@src/runtime/config";

const config = readConfig();

parseArguments(config);

function parseArguments(config: RuntimeConfig) {
  yargs(hideBin(process.argv))
    .scriptName("gaudi-cli")
    .command({
      command: "build",
      describe: "Build Gaudi source",
      handler: (args) => buildCommand(args, config),
    })
    .command({
      command: "run",
      describe: "Run Gaudi",
      handler: (args) => runCommand(args, config),
    })
    .command({
      command: "db",
      describe: "Make changes to DB",
      handler: () => {
        //
      },
      builder: (yargs) =>
        yargs
          .command({
            command: "push",
            describe: "Push model changes to DB",
            handler: (args) => dbPushCommand(args, config),
          })
          .command({
            command: "reset",
            describe: "Reset DB",
            handler: (args) => dbResetCommand(args, config),
          })
          .command({
            command: "populate",
            describe: "Reset DB and populate using populator",
            handler: (args) => dbPopulateCommand(args, config),
            builder: (yargs) =>
              yargs
                .option("populator", {
                  alias: "p",
                  type: "string",
                  description: "Name of populator to use in population",
                })
                .demandOption("populator"),
          })
          .command({
            command: "migrate",
            builder: {
              migrate: {},
            },
            describe: "Create DB migration file",
            handler: (args) => dbMigrateCommand(args, config),
          })
          .demandCommand(),
    })

    .help()
    .alias("help", "h")
    .demandCommand()
    .parse();
}

function buildCommand(_args: ArgumentsCamelCase, _config: RuntimeConfig) {
  console.log("Build Gaudi source");

  executeCommand("npx", ["gaudi-engine", "--enable-source-maps"]);
}

function runCommand(_args: ArgumentsCamelCase, _config: RuntimeConfig) {
  // node --enable-source-maps ./node_modules/@gaudi/engine/runtime/runtime.js
  console.log("Run Gaudi project");

  executeCommand("npx", ["gaudi-runtime", "--enable-source-maps"]);
}

function dbPushCommand(_args: ArgumentsCamelCase, config: RuntimeConfig) {
  // npx prisma db push --schema=./dist/db/schema.prisma --accept-data-loss
  console.log("Push DB changes");

  executeCommand("npx", [
    "prisma",
    "db",
    "push",
    `--schema=${dbSchemaPath(config.outputFolder)}`,
    "--accept-data-loss",
  ]);
}

function dbResetCommand(args: ArgumentsCamelCase, config: RuntimeConfig) {
  // npx prisma db push --force-reset --schema=./dist/db/schema.prisma
  console.log("Reset DB");

  executeCommand("npx", [
    "prisma",
    "db",
    "push",
    "--force-reset",
    `--schema=${dbSchemaPath(config.outputFolder)}`,
  ]);
}

type DbPopulateOptions = {
  /** Populator name */
  populator?: string;
};

function dbPopulateCommand(args: ArgumentsCamelCase<DbPopulateOptions>, _config: RuntimeConfig) {
  // node ./node_modules/@gaudi/engine/runtime/populator/populator.js -p Dev
  const populatorName = args.populator!;
  console.log(`Populate DB using populator "${populatorName}"`);

  executeCommand("npx", ["gaudi-populator", "-p", populatorName]);
}

type DbMigrateOptions = {
  name?: string;
};
function dbMigrateCommand(args: ArgumentsCamelCase<DbMigrateOptions>, config: RuntimeConfig) {
  const migrationName = args.name!;
  console.log(`Create DB migration ${migrationName}`);

  executeCommand("npx", [
    "gaudi-populator",
    `--name=${migrationName}`,
    `--schema=${dbSchemaPath(config.outputFolder)}`,
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

#!/usr/bin/env node

// import this file only with relative path because this file actually configures path aliases (eg @src, ...)
import "../common/setupAliases";

import { spawn } from "child_process";
import { WatchOptions } from "fs";
import path from "path";

import chokidar from "chokidar";
import copyfiles from "copyfiles";
import _ from "lodash";
import yargs, { ArgumentsCamelCase } from "yargs";
import { hideBin } from "yargs/helpers";

import { EngineConfig, readConfig } from "@src/config";

type Stoppable = {
  stop: () => Promise<void>;
};

const DEFAULT_NODE_OPTIONS = [
  // development node options - maybe we should allow disabling them in production?
  "--enable-source-maps",
  "--stack-trace-limit=30",
  "--stack-size=2048",
];

/**
 * Paths to Gaudi scripts
 *
 * Target Gaudi scripts directly instead of via NPX because we cannot pass some node options through NPX (via --node-options")
 * See a list of allowed options here: https://nodejs.org/docs/latest-v16.x/api/cli.html#node_optionsoptions
 */
const GAUDI_SCRIPTS = {
  ENGINE: path.join(__dirname, "../engine.js"),
  RUNTIME: path.join(__dirname, "../runtime/runtime.js"),
  POPULATOR: path.join(__dirname, "../populator/populator.js"),
};

const engineConfig = readConfig();

parseArguments(engineConfig);

function parseArguments(config: EngineConfig) {
  yargs(hideBin(process.argv))
    .scriptName("gaudi-cli")
    .command({
      command: "build",
      describe:
        "Build entire project. Compiles Gaudi source, pushes changes to DB and copies files to output folder",
      handler: (args) => buildCommand(args, config),
    })
    .command({
      command: "dev",
      describe: "Start project dev builder which rebuilds project on detected source changes.",
      handler: (args) => devCommand(args, config),
    })
    .command({
      command: "compile",
      describe: "Compile Gaudi source",
      handler: (args) => {
        compileCommand(args, config);
      },
    })
    .command({
      command: "start",
      describe: "Start Gaudi project",
      handler: (args) => {
        startCommand(args, config);
      },
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
            handler: (args) => {
              dbPushCommand(args, config);
            },
          })
          .command({
            command: "reset",
            describe: "Reset DB",
            handler: (args) => {
              dbResetCommand(args, config);
            },
          })
          .command({
            command: "populate",
            describe: "Reset DB and populate it using populator",
            handler: (args) => {
              dbPopulateCommand(args, config);
            },
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
            handler: (args) => {
              dbMigrateCommand(args, config);
            },
          })
          .command({
            command: "deploy",
            describe: "Deploy migrations to production database",
            handler: (args) => {
              dbDeployCommand(args, config);
            },
          })
          .demandCommand(),
    })

    .help()
    .alias("help", "h")
    .demandCommand()
    .strict()
    .parse();
}

// --- build

async function buildCommand(args: ArgumentsCamelCase, config: EngineConfig) {
  console.log("Building entire project ...");

  await compileCommand(args, config);
  await dbPushCommand(args, config);
  await copyStaticCommand(args, config);
}

// --- dev

async function devCommand(args: ArgumentsCamelCase, config: EngineConfig) {
  console.log("Starting project dev build ...");

  const children: Stoppable[] = [];

  async function stop() {
    for (const c in children) {
      await children[c].stop();
    }
    console.log(`Stopped ${children.length} child processes`);

    // truncate children
    children.length = 0;
  }

  process.on("beforeExit", async () => {
    console.log("Before exit");
    await stop();
  });

  children.push(watchCompileCommand(args, config));
  children.push(watchDbPushCommand(args, config));
  children.push(watchCopyStaticCommand(args, config));
}

function watchCompileCommand(args: ArgumentsCamelCase, config: EngineConfig): Stoppable {
  const run = async () => {
    await compileCommand(args, config);
  };

  const resources = [
    // compiler input path
    path.join(config.inputPath),
  ];

  return watchResource(resources, run);
}

function watchDbPushCommand(args: ArgumentsCamelCase, config: EngineConfig): Stoppable {
  const run = async () => {
    await dbPushCommand(args, config);
  };

  const resources = [getDbSchemaPath(config)];

  return watchResource(resources, run);
}

function watchCopyStaticCommand(args: ArgumentsCamelCase, config: EngineConfig): Stoppable {
  const run = async () => {
    await copyStaticCommand(args, config);
  };

  const resources = [
    // gaudi DB folder
    path.join(config.gaudiFolder, "db"),
  ];

  return watchResource(resources, run);
}

// --- compile

function compileCommand(_args: ArgumentsCamelCase, _config: EngineConfig) {
  console.log("Compiling Gaudi source ...");

  return executeCommand("node", [...getDefaultNodeOptions(), GAUDI_SCRIPTS.ENGINE]);
}

// --- start

function startCommand(_args: ArgumentsCamelCase, _config: EngineConfig) {
  console.log("Starting Gaudi project ...");

  return executeCommand("node", [...getDefaultNodeOptions(), GAUDI_SCRIPTS.RUNTIME]);
}

// --- copy static

function copyStaticCommand(_args: ArgumentsCamelCase, config: EngineConfig) {
  console.log("Copying static resources ...");

  return new Promise((resolve, reject) => {
    copyfiles(
      [path.join(config.gaudiFolder, "db", "**"), config.outputFolder],
      { up: -1, verbose: true, error: true },
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(err);
        }
      }
    );
  });
}

// --- DB push

function dbPushCommand(_args: ArgumentsCamelCase, config: EngineConfig) {
  console.log("Pushing DB change ...");

  return executeCommand("npx", [
    "prisma",
    "db",
    "push",
    `--schema=${getDbSchemaPath(config)}`,
    "--accept-data-loss",
  ]);
}

// --- DB reset

function dbResetCommand(args: ArgumentsCamelCase, config: EngineConfig) {
  console.log("Resetting DB ...");

  return executeCommand("npx", [
    "prisma",
    "db",
    "push",
    "--force-reset",
    `--schema=${getDbSchemaPath(config)}`,
  ]);
}

// --- DB populate

type DbPopulateOptions = {
  /** Populator name */
  populator?: string;
};

function dbPopulateCommand(args: ArgumentsCamelCase<DbPopulateOptions>, _config: EngineConfig) {
  const populatorName = args.populator!;

  if (_.isEmpty(populatorName)) throw "Populator name cannot be empty";

  console.log(`Populating DB using populator "${populatorName} ..."`);

  return executeCommand("node", [
    ...getDefaultNodeOptions(),
    GAUDI_SCRIPTS.POPULATOR,
    "-p",
    populatorName,
  ]);
}

// --- DB migrate

type DbMigrateOptions = {
  name?: string;
};

function dbMigrateCommand(args: ArgumentsCamelCase<DbMigrateOptions>, config: EngineConfig) {
  const migrationName = args.name;

  if (_.isEmpty(migrationName)) throw "Migration name cannot be empty";

  console.log(`Creating DB migration "${migrationName}" ...`);

  return executeCommand("npx", [
    "prisma",
    "migrate",
    "dev",
    `--name=${migrationName}`,
    `--schema=${getDbSchemaPath(config)}`,
  ]);
}

// --- DB deploy

function dbDeployCommand(args: ArgumentsCamelCase<DbMigrateOptions>, config: EngineConfig) {
  console.log(`Deploying DB migrations ...`);

  return executeCommand("npx", [
    "prisma",
    "migrate",
    "deploy",
    `--schema=${getDbSchemaPath(config)}`,
  ]);
}

// ---------- utils

function executeCommand(command: string, argv: string[]) {
  console.log(`Command: ${command} ${argv.join(" ")}`);

  return new Promise<number | null>((resolve, reject) => {
    const childProcess = spawn(command, argv, {
      env: {
        ...process.env,
      },
      shell: true, // let shell interpret arguments as if they would be when called directly from shell
      stdio: "inherit", // allow child processes to use std streams
    });

    childProcess.on("error", (err) => {
      reject(err);
    });
    childProcess.on("exit", (code) => {
      if (code === 0 || code == null) {
        resolve(code);
      } else {
        reject(`Process exited with error code: ${code}`);
      }
    });
  });
}

function getDbSchemaPath(config: EngineConfig): string {
  return `${config.gaudiFolder}/db/schema.prisma`;
}

/**
 * Default node options
 *
 * Additional node options can be passed via NODE_OPTIONS env var which is included when executing command
 */
function getDefaultNodeOptions(): string[] {
  return [...DEFAULT_NODE_OPTIONS];
}

// --- file watcher

function watchResource(target: string | string[], callback: () => Promise<void>): Stoppable;
function watchResource(
  target: string | string[],
  callback: () => Promise<void>,
  options?: WatchOptions
): Stoppable {
  // TODO: debounce callback

  const watcher = chokidar
    .watch(target, { ...options })
    // file listeners
    .on("add", callback)
    .on("change", callback)
    .on("unlink", callback)
    // folder listeners
    .on("addDir", callback)
    .on("unlinkDir", callback)
    // attached all listeners
    .on("ready", callback);

  return {
    stop: () => {
      return watcher.close();
    },
  };
}

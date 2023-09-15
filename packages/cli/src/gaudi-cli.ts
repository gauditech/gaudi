#!/usr/bin/env node

import path from "path";

import { initLogger } from "@gaudi/compiler";
import { createAsyncQueueContext } from "@gaudi/compiler/dist/common/async/queueAsync";
import { EngineConfig, readConfig } from "@gaudi/compiler/dist/config";
import _ from "lodash";
import yargs, { ArgumentsCamelCase } from "yargs";
import { hideBin } from "yargs/helpers";

import { compile } from "@cli/command/compile";
import { copyStatic } from "@cli/command/copyStatic";
import {
  DbMigrateOptions,
  DbPopulateOptions,
  dbDeploy,
  dbMigrate,
  dbPopulate,
  dbPush,
  dbReset,
} from "@cli/command/db";
import { start } from "@cli/command/start";
import { attachProcessCleanup } from "@cli/process";
import { CommandRunner } from "@cli/runner";
import { Controllable } from "@cli/types";
import { resolveModulePath } from "@cli/utils";
import { watchResources } from "@cli/watcher";

const logger = initLogger("gaudi:cli");

logger.debug("CLI argv:", process.argv);

parseArguments();

function parseArguments() {
  yargs(hideBin(process.argv))
    .usage("$0 <command> [arguments]")
    .command({
      command: "build [root]",
      describe: "Build entire project. Compiles Gaudi code and copies files to output directory",
      handler: (args) => {
        buildCommandHandler(args);
      },
      builder: (yargs) =>
        yargs.positional("root", {
          type: "string",
          describe: "project root directory",
        }),
    })
    .command({
      command: "dev [root] [options]",
      describe: "Start project dev builder which rebuilds project on detected code changes.",
      handler: (args) => {
        devCommandHandler(args);
      },
      builder: (yargs) =>
        yargs
          .positional("root", {
            type: "string",
            describe: "project root directory",
          })
          .option("gaudi-dev", {
            hidden: true, // this is a hidden option for developing gaudi itself
            type: "boolean",
            description: "Watch additional Gaudi resources when developing Gaudi itself",
          }),
    })
    .command({
      command: "start [root]",
      describe: "Start application server",
      handler: (args) => {
        startCommandHandler(args);
      },
      builder: (yargs) =>
        yargs.positional("root", {
          type: "string",
          describe: "project root directory",
        }),
    })
    .command({
      command: "db",
      describe: "Executes a database command. Run 'gaudi db' for more info.",
      handler: () => {
        // handler is required but this a noop
      },
      builder: (yargs) =>
        yargs
          .command({
            command: "push [root]",
            describe: "Push model changes to development database",
            handler: (args) => {
              dbPushCommandHandler(args);
            },
            builder: (yargs) =>
              yargs.positional("root", {
                type: "string",
                describe: "project root directory",
              }),
          })
          .command({
            command: "reset [root]",
            describe: "Reset database",
            handler: (args) => {
              dbResetCommandHandler(args);
            },
            builder: (yargs) =>
              yargs.positional("root", {
                type: "string",
                describe: "project root directory",
              }),
          })
          .command({
            command: "populate [root] [options]",
            describe: "Reset database and populate it using given populator",
            handler: (args) => {
              dbPopulateCommandHandler(args);
            },
            builder: (yargs) =>
              yargs
                .positional("root", {
                  type: "string",
                  describe: "project root directory",
                })
                .option("populator", {
                  alias: "p",
                  type: "string",
                  description: "Name of populator to use in population",
                  demandOption: '  try adding: "--populator=<populator name>"',
                }),
          })
          .command({
            command: "migrate [root] [options]",
            describe: "Create DB migration file",
            builder: (yargs) =>
              yargs
                .positional("root", {
                  type: "string",
                  describe: "project root directory",
                })
                .option("name", {
                  alias: "n",
                  type: "string",
                  description: "Name of a migration to be created",
                  demandOption: '  try adding "--name=<migration name>"',
                }),
            handler: (args) => {
              dbMigrateCommandHandler(args);
            },
          })
          .command({
            command: "deploy [root]",
            describe: "Deploy yet undeployed migrations to target database",
            handler: (args) => {
              dbDeployCommandHandler(args);
            },
            builder: (yargs) =>
              yargs.positional("root", {
                type: "string",
                describe: "project root directory",
              }),
          })
          // fallback to help message
          .command({
            command: "*",
            handler() {
              yargs.showHelp();
            },
          }),
    })

    // fallback to help message
    .command({
      command: "*",
      handler() {
        yargs.showHelp();
      },
    })

    .example([
      ["$0 dev", "Run Gaudi in dev mode"],
      ["$0 db populate -p <populator-name>", "Populate database using named populator"],
      ["$0 db push", "Sync model and database"],
      ["$0 start", "Start project"],
    ])

    .epilog("See Gaudi docs for more info")

    .help()
    .alias("help", "h")
    .strict()
    .parse();
}

// --------- command handlers

// --- common

type CommonCommandArgs = {
  /** Project root directory */
  root?: string;
  /** Gaudi dev mode. Adds `node_modules/@gaudi/*` to file watch list. Option convenient when developing Gaudi itself */
  gaudiDev?: boolean;
};

function setupCommandEnv(args: ArgumentsCamelCase<CommonCommandArgs>) {
  // change root/working dir
  if (args.root) {
    const resolvedRoot = path.resolve(args.root);
    process.chdir(resolvedRoot);
    logger.debug(`Working directory set to "${resolvedRoot}"`);
  }
  // gaudi development
  if (args.gaudiDev) {
    logger.debug("Gaudi dev mode enabled.");
  }
}

// --- build command

async function buildCommandHandler(args: ArgumentsCamelCase<CommonCommandArgs>) {
  console.log("Building entire project ...");

  setupCommandEnv(args);

  const config = readConfig();

  await compile(config).start();
  await copyStatic(config);
}

// --- dev command

async function devCommandHandler(args: ArgumentsCamelCase<CommonCommandArgs>) {
  console.log("Starting project dev build ... ");

  setupCommandEnv(args);

  const config = readConfig();

  let watcher: Controllable | undefined;
  const commands = [
    watchCompileCommand(args, config),
    watchCopyStaticCommand(args, config),
    watchDbPushCommand(args, config),
    watchRuntimeCommand(args, config),
  ];

  const runCommands = async () => {
    for (const c of commands) {
      try {
        await c.start();
      } catch (err) {
        logger.error(`Error stopping command`, err);
      }
    }
  };

  async function start() {
    const resources = _.compact([
      // watch compiler input path
      path.join(config.inputDirectory, "**/*.gaudi"),
      // gaudi DB directory
      path.join(config.gaudiDirectory, "db"),
      // watch gaudi files (during Gaudi dev)
      args.gaudiDev ? resolveModulePath("@gaudi/compiler/") : null,
    ]);
    // create async queue to serialize multiple calls
    const enqueue = createAsyncQueueContext();

    const run = async () => enqueue(runCommands);

    // TODO: if commands change watched files, new watch events will be fired
    // otoh, if we disable watching during command execution we might miss user's manual changes
    watcher = watchResources(resources, run);

    await watcher.start();
  }

  async function cleanup() {
    await watcher?.stop();

    for (const c of commands) {
      try {
        await c.stop();
      } catch (err) {
        logger.error(`Error stopping command`, err);
      }
    }
  }

  attachProcessCleanup(process, cleanup);

  await start();
}

function watchCompileCommand(
  args: ArgumentsCamelCase<CommonCommandArgs>,
  config: EngineConfig
): Controllable {
  // create async queue to serialize multiple command calls
  const enqueue = createAsyncQueueContext();

  const run = async () =>
    enqueue(() =>
      compile(config)
        .start()
        .catch((err) => {
          // just use catch to prevent error from leaking to node and finishing entire watch process
          // command will be reexecuted anyway on next change
          logger.error("Error running compile command:", err);
        })
    );
  return {
    start: run,
    stop: async () => {
      //
    },
  };
}

function watchDbPushCommand(
  _args: ArgumentsCamelCase<CommonCommandArgs>,
  config: EngineConfig
): Controllable {
  // create async queue to serialize multiple command calls
  const enqueue = createAsyncQueueContext();

  const run = async () =>
    enqueue(() =>
      dbPush(config)
        .start()
        .catch((err) => {
          // just use catch to prevent error from leaking to node and finishing entire watch process
          // command will be reexecuted anyway on next change
          logger.error("Error running DB push command:", err);
        })
    );
  return {
    start: run,
    stop: async () => {
      //
    },
  };
}

function watchCopyStaticCommand(
  _args: ArgumentsCamelCase<CommonCommandArgs>,
  config: EngineConfig
): Controllable {
  // create async queue to serialize multiple command calls
  const enqueue = createAsyncQueueContext();

  const run = async () =>
    enqueue(() =>
      copyStatic(config).catch((err) => {
        // just use catch to prevent error from leaking to node and finishing entire watch process
        // command will be reexecuted anyway on next change
        logger.error("Error running copy static command:", err);
      })
    );

  return {
    start: run,
    stop: async () => {
      //
    },
  };
}

function watchRuntimeCommand(
  args: ArgumentsCamelCase<CommonCommandArgs>,
  config: EngineConfig
): Controllable {
  // create async queue to serialize multiple command calls
  const enqueue = createAsyncQueueContext();

  let command: CommandRunner | undefined;

  const run = () =>
    enqueue(() =>
      Promise.resolve()
        .then(async () => {
          if (command != null && command.isRunning()) {
            return command.stop();
          }
        })
        .then(() => {
          // create new command
          command = start(config);
          command.start();
        })
        .catch((err) => {
          // just use catch to prevent error from leaking to node and finishing entire watch process
          // command will be reexecuted anyway on next change
          logger.error("Error running runtime command:", err);
        })
    );

  return {
    start: run,
    stop: async () => {
      command?.stop();
    },
  };
}

// --- start command

async function startCommandHandler(args: ArgumentsCamelCase<CommonCommandArgs>) {
  setupCommandEnv(args);

  const config = readConfig();

  return start(config).start();
}

// --- DB commands

// --- DB push command

function dbPushCommandHandler(args: ArgumentsCamelCase<CommonCommandArgs>) {
  setupCommandEnv(args);

  const config = readConfig();

  return dbPush(config).start();
}

// --- DB reset

function dbResetCommandHandler(args: ArgumentsCamelCase<CommonCommandArgs>) {
  setupCommandEnv(args);

  const config = readConfig();

  return dbReset(config).start();
}

// --- DB populate

function dbPopulateCommandHandler(args: ArgumentsCamelCase<CommonCommandArgs & DbPopulateOptions>) {
  setupCommandEnv(args);

  const config = readConfig();

  return dbPopulate(args, config)
    .start()
    .catch((err) => {
      // just use catch to prevent error from leaking to node and finishing entire watch process
      // command will be reexecuted anyway on next change
      logger.error("Error running db populate command:", err);
    });
}

// --- DB migrate

function dbMigrateCommandHandler(args: ArgumentsCamelCase<DbMigrateOptions & CommonCommandArgs>) {
  setupCommandEnv(args);

  const config = readConfig();

  return dbMigrate(args, config).start();
}

// --- DB deploy

function dbDeployCommandHandler(args: ArgumentsCamelCase<CommonCommandArgs>) {
  setupCommandEnv(args);

  const config = readConfig();

  return dbDeploy(config).start();
}

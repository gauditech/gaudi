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
import { Controllable } from "@cli/types";
import { resolveModulePath } from "@cli/utils";
import { watchResources } from "@cli/watcher";

const logger = initLogger("gaudi:cli");
parseArguments();

function parseArguments() {
  yargs(hideBin(process.argv))
    .usage("$0 <command> [arguments]")
    .command({
      command: "build [root]",
      describe: "Build entire project. Compiles Gaudi code and copies files to output folder",
      handler: (args) => {
        buildCommandHandler(args);
      },
      builder: (yargs) =>
        yargs.positional("root", {
          type: "string",
          describe: "project root folder",
        }),
    })
    .command({
      command: "dev [root]",
      describe: "Start project dev builder which rebuilds project on detected code changes.",
      handler: (args) => {
        devCommandHandler(args);
      },
      builder: (yargs) =>
        yargs
          .positional("root", {
            type: "string",
            describe: "project root folder",
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
          describe: "project root folder",
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
                describe: "project root folder",
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
                describe: "project root folder",
              }),
          })
          .command({
            command: "populate [root] --populator=<populator name>",
            describe: "Reset database and populate it using given populator",
            handler: (args) => {
              dbPopulateCommandHandler(args);
            },
            builder: (yargs) =>
              yargs
                .positional("root", {
                  type: "string",
                  describe: "project root folder",
                })
                .option("populator", {
                  alias: "p",
                  type: "string",
                  description: "Name of populator to use in population",
                  demandOption: '  try adding: "--populator=<populator name>"',
                }),
          })
          .command({
            command: "migrate [root] --name=<migration name>",
            describe: "Create DB migration file",
            builder: (yargs) =>
              yargs
                .positional("root", {
                  type: "string",
                  describe: "project root folder",
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
                describe: "project root folder",
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
      ["$0 init <project-name>", "Initialize new project"],
      ["$0 dev", "Run Gaudi in dev mode"],
      ["$0 db populate -p <populator-name>", "Populate database using named populator"],
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
  /** Project root folder */
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
  logger.debug("Building entire project ...");

  setupCommandEnv(args);

  const config = readConfig();

  await compile(config).start();
  await dbPush(config).start();
  await copyStatic(config);
}

// --- dev command

async function devCommandHandler(args: ArgumentsCamelCase<CommonCommandArgs>) {
  logger.debug("Starting project dev build ... ");

  setupCommandEnv(args);

  const config = readConfig();

  const children: Controllable[] = [];

  async function start() {
    if (children.length > 0) {
      const promises = children.map((c) => c.start());

      const results = await Promise.allSettled(promises);
      // check for errors during stopping
      results.forEach((r) => {
        if (r.status === "rejected") {
          logger.error("Dev mode start error: ", r.reason);
        }
      });
    }
  }

  async function cleanup() {
    if (children.length > 0) {
      const promises = children.map((c) => c.stop());

      const results = await Promise.allSettled(promises);
      // check for errors during stopping
      results.forEach((r) => {
        if (r.status === "rejected") {
          logger.error("Dev mode cleanup error: ", r.reason);
        }
      });
    }
  }

  attachProcessCleanup(process, cleanup);

  // --- start dev commands

  children.push(watchCompileCommand(args, config));
  children.push(watchDbPushCommand(args, config));
  children.push(watchCopyStaticCommand(args, config));
  children.push(watchStartCommand(args, config));

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

  const resources = _.compact([
    // watch compiler input path
    path.join(config.inputFolder, "**/*.gaudi"),
    // watch gaudi files (during Gaudi dev)
    args.gaudiDev ? resolveModulePath("@gaudi/compiler/") : null,
  ]);

  const watcher = watchResources(resources, run, { ignoreInitial: true });

  return {
    start: async () => {
      await run();
      await watcher.start();
    },
    stop: async () => {
      await watcher.stop();
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

  const resources = [
    // prisma schema
    path.join(config.gaudiFolder, "db", "schema.prisma"),
  ];

  const watcher = watchResources(resources, run, { ignoreInitial: true });

  return {
    start: async () => {
      await run();
      await watcher.start();
    },
    stop: async () => {
      await watcher.stop();
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

  // keep these resources in sync with the list of files this command actually copies
  const resources = [
    // gaudi DB folder
    path.join(config.gaudiFolder, "db"),
  ];

  const watcher = watchResources(resources, run, { ignoreInitial: true });

  return {
    start: async () => {
      await run();
      await watcher.start();
    },
    stop: async () => {
      await watcher.stop();
    },
  };
}

function watchStartCommand(
  args: ArgumentsCamelCase<CommonCommandArgs>,
  config: EngineConfig
): Controllable {
  // no need for async enqueueing since `nodemon` is a long running process and we cannot await for it to finish

  const command = start(config);

  const run = async () => {
    if (!command.isRunning()) {
      await command.start().catch((err) => {
        // just use catch to prevent error from leaking to node and finishing entire watch process
        // nodemon will restart process on change anyway
        logger.error("Error running start command:", err);
      });
    } else {
      // ask `nodemon` to restart monitored process
      // https://github.com/remy/nodemon/wiki/Events
      command.sendMessage("restart");
    }
  };

  const resources = _.compact([
    // gaudi output folder
    path.join(config.outputFolder),
    // watch gaudi files (during Gaudi dev)
    args.gaudiDev ? resolveModulePath("@gaudi/compiler/") : null,
    args.gaudiDev ? resolveModulePath("@gaudi/runtime/") : null,
  ]);

  // use our resource watcher instead of `nodemon`'s watching to keep to consistent
  const watcher = watchResources(resources, run, { ignoreInitial: true });

  return {
    start: async () => {
      run(); // long running process, dont await - see `run()` for more info
      await watcher.start();
    },
    stop: async () => {
      await watcher.stop();
      command.stop(); // manually stop command - see `run()` for more info
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

#!/usr/bin/env node

// import this file only with relative path because this file actually configures path aliases (eg @src, ...)
import "../common/setupAliases";

import path from "path";

import _ from "lodash";
import yargs, { ArgumentsCamelCase } from "yargs";
import { hideBin } from "yargs/helpers";

import { compile } from "@src/cli/command/compile";
import { copyStatic } from "@src/cli/command/copyStatic";
import {
  DbMigrateOptions,
  DbPopulateOptions,
  dbDeploy,
  dbMigrate,
  dbPopulate,
  dbPush,
  dbReset,
} from "@src/cli/command/db";
import { InitProjectOptions, initProject } from "@src/cli/command/initProject";
import { start } from "@src/cli/command/start";
import { attachProcessCleanup } from "@src/cli/process";
import { Stoppable } from "@src/cli/types";
import { watchResources } from "@src/cli/watcher";
import { createAsyncQueueContext } from "@src/common/async/queueAsync";
import { EngineConfig, readConfig } from "@src/config";

const engineConfig = readConfig();

parseArguments(engineConfig);

function parseArguments(config: EngineConfig) {
  yargs(hideBin(process.argv))
    .scriptName("gaudi-cli")
    .command({
      command: "build",
      describe:
        "Build entire project. Compiles Gaudi blueprint, pushes changes to DB and copies files to output folder",
      handler: (args) => buildCommandHandler(args, config),
    })
    .command({
      command: "dev",
      describe: "Start project dev builder which rebuilds project on detected blueprint changes.",
      handler: (args) => devCommandHandler(args, config),
      builder: (yargs) =>
        yargs.option("gaudi-dev", {
          hidden: true, // this is hidden option for devloping gaudi itself
          type: "boolean",
          description: "Watch additional Gaudi resources when developing Gaudi itself",
        }),
    })
    .command({
      command: "start",
      describe: "Start Gaudi project",
      handler: (args) => {
        startCommandHandler(args, config);
      },
    })
    .command({
      command: "init <name>",
      describe: "Init new Gaudi project",
      builder: (yargs) =>
        yargs.positional("name", {
          type: "string",
          description: "new project name",
          demandOption: true,
        }),
      handler: (args) => {
        initCommandHandler(args, config);
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
              dbPushCommandHandler(args, config);
            },
          })
          .command({
            command: "reset",
            describe: "Reset DB",
            handler: (args) => {
              dbResetCommandHandler(args, config);
            },
          })
          .command({
            command: "populate",
            describe: "Reset DB and populate it using populator",
            handler: (args) => {
              dbPopulateCommandHandler(args, config);
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
              dbMigrateCommandHandler(args, config);
            },
          })
          .command({
            command: "deploy",
            describe: "Deploy migrations to production database",
            handler: (args) => {
              dbDeployCommandHandler(args, config);
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

// --------- command handlers

// --- build command

async function buildCommandHandler(args: ArgumentsCamelCase, config: EngineConfig) {
  console.log("Building entire project ...");

  await compile(args, config).start();
  await dbPush(args, config).start();
  await copyStatic(args, config);
}

// --- dev command

type DevOptions = {
  /** Gaudi dev mode */
  gaudiDev?: boolean;
};

async function devCommandHandler(args: ArgumentsCamelCase<DevOptions>, config: EngineConfig) {
  console.log("Starting project dev build ...");
  if (args.gaudiDev) {
    console.log("Gaudi dev mode enabled.");
  }

  const children: Stoppable[] = [];

  async function cleanup() {
    if (children.length > 0) {
      const promises = children.map((c) => c.stop());

      const results = await Promise.allSettled(promises);
      // check for errors during stopping
      results.forEach((r) => {
        if (r.status === "rejected") {
          console.error("Cleanup error: ", r.reason);
        }
      });
    }
  }

  // --- start dev commands

  attachProcessCleanup(process, cleanup);

  children.push(watchCompileCommand(args, config));
  children.push(watchDbPushCommand(args, config));
  children.push(watchCopyStaticCommand(args, config));
  children.push(watchStartCommand(args, config));
}

function watchCompileCommand(
  args: ArgumentsCamelCase<DevOptions>,
  config: EngineConfig
): Stoppable {
  // create async queue to serialize multiple command calls
  const enqueue = createAsyncQueueContext();

  const run = async () => {
    enqueue(() =>
      compile(args, config)
        .start()
        .catch((err) => {
          // just use catch to prevent error from leaking to node and finishing entire watch process
          // command will be reexecuted anyway on next change
          console.error("Error running compile command:", err);
        })
    );
  };

  const resources = _.compact([
    // compiler input path
    path.join(config.inputPath),
    args.gaudiDev ? "./node_modules/@gaudi/engine/" : null,
  ]);

  return watchResources(resources, run);
}

function watchDbPushCommand(args: ArgumentsCamelCase, config: EngineConfig): Stoppable {
  // create async queue to serialize multiple command calls
  const enqueue = createAsyncQueueContext();

  const run = async () => {
    enqueue(() =>
      dbPush(args, config)
        .start()
        .catch((err) => {
          // just use catch to prevent error from leaking to node and finishing entire watch process
          // command will be reexecuted anyway on next change
          console.error("Error running DB push command:", err);
        })
    );
  };

  const resources = [
    // gaudi DB folder
    path.join(config.gaudiFolder, "db"),
  ];

  return watchResources(resources, run);
}

function watchCopyStaticCommand(args: ArgumentsCamelCase, config: EngineConfig): Stoppable {
  // create async queue to serialize multiple command calls
  const enqueue = createAsyncQueueContext();

  const run = async () => {
    enqueue(() =>
      copyStatic(args, config).catch((err) => {
        // just use catch to prevent error from leaking to node and finishing entire watch process
        // command will be reexecuted anyway on next change
        console.error("Error running copy static command:", err);
      })
    );
  };

  // keep these resources in sync with the list of files this command actually copies
  const resources = [
    // gaudi DB folder
    path.join(config.gaudiFolder, "db"),
  ];

  return watchResources(resources, run);
}

function watchStartCommand(args: ArgumentsCamelCase<DevOptions>, config: EngineConfig): Stoppable {
  // no need for async enqueueing since `nodemon` is a long running process and we cannot await for it to finish

  const command = start(args, config);

  const run = async () => {
    if (!command.isRunning()) {
      await command.start().catch((err) => {
        // just use catch to prevent error from leaking to node and finishing entire watch process
        // nodemon will restart process on change anyway
        console.error("Error running start command:", err);
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
    args.gaudiDev ? "./node_modules/@gaudi/engine/runtime" : null,
  ]);

  // use our resource watcher instead of `nodemon`'s watching to keep to consistent
  const watcher = watchResources(resources, run);

  return {
    stop: async () => {
      await watcher.stop();
      command.stop();
    },
  };
}

// --- start command

async function startCommandHandler(args: ArgumentsCamelCase, config: EngineConfig) {
  return start(args, config).start();
}

// --- init project command

async function initCommandHandler(
  args: ArgumentsCamelCase<InitProjectOptions>,
  config: EngineConfig
) {
  return initProject(args, config);
}

// -- DB push command
function dbPushCommandHandler(args: ArgumentsCamelCase, config: EngineConfig) {
  return dbPush(args, config).start();
}

// --- DB reset

function dbResetCommandHandler(args: ArgumentsCamelCase, config: EngineConfig) {
  return dbReset(args, config).start();
}

// --- DB populate

function dbPopulateCommandHandler(
  args: ArgumentsCamelCase<DbPopulateOptions>,
  config: EngineConfig
) {
  return dbPopulate(args, config)
    .start()
    .catch((err) => {
      // just use catch to prevent error from leaking to node and finishing entire watch process
      // command will be reexecuted anyway on next change
      console.error("Error running db populate command:", err);
    });
}

// --- DB migrate

function dbMigrateCommandHandler(args: ArgumentsCamelCase<DbMigrateOptions>, config: EngineConfig) {
  return dbMigrate(args, config).start();
}

// --- DB deploy

function dbDeployCommandHandler(args: ArgumentsCamelCase<DbMigrateOptions>, config: EngineConfig) {
  return dbDeploy(args, config).start();
}

#!/usr/bin/env node

// import this file only with relative path because this file actually configures path aliases (eg @src, ...)
import "../common/setupAliases";

import { ChildProcess, spawn } from "child_process";
import { WatchOptions } from "fs";
import path from "path";

import chokidar from "chokidar";
import copyfiles from "copyfiles";
import _ from "lodash";
import yargs, { ArgumentsCamelCase } from "yargs";
import { hideBin } from "yargs/helpers";

import { createAsyncQueueContext } from "@src/common/async/queueAsync";
import { EngineConfig, readConfig } from "@src/config";

/**
 * Something that can be stopped like eg. resource watcher.
 *
 * We should add "start" if we need to have control over starting (eg. do it later/elsewhere).
 */
type Stoppable = {
  stop: () => Promise<void>;
};

// defaul Node options
const DEFAULT_NODE_OPTIONS = [
  // development node options - maybe we should allow disabling them in production?
  "--enable-source-maps",
  "--stack-trace-limit=30",
  "--stack-size=2048",
];

/**
 * Time to wait before reporting resource watcher changes (in millis).
 *
 * This allows basic debouncing (eg. when creating/updating multiple files at once).
 */
const RESOURCE_WATCH_DELAY = 500;

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
      handler: (args) => buildCommandHandler(args, config),
    })
    .command({
      command: "dev",
      describe: "Start project dev builder which rebuilds project on detected source changes.",
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
    enqueue(() => compile(args, config).start());
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
    enqueue(() => dbPush(args, config).start());
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
    enqueue(() => copyStatic(args, config));
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
      await command.start();
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
  console.log("Building entire project ...");

  return start(args, config).start();
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
  return dbPopulate(args, config).start();
}

// --- DB migrate

function dbMigrateCommandHandler(args: ArgumentsCamelCase<DbMigrateOptions>, config: EngineConfig) {
  return dbMigrate(args, config).start();
}

// --- DB deploy

function dbDeployCommandHandler(args: ArgumentsCamelCase<DbMigrateOptions>, config: EngineConfig) {
  return dbDeploy(args, config).start();
}

// ---------- internal commands

// --- compile

function compile(_args: ArgumentsCamelCase, _config: EngineConfig) {
  console.log("Compiling Gaudi source ...");

  return executeCommand("node", [...getDefaultNodeOptions(), GAUDI_SCRIPTS.ENGINE]);
}

// --- server commands

function start(_args: ArgumentsCamelCase, _config: EngineConfig) {
  console.log("Starting Gaudi project ...");

  // use `nodemon` to control (start, reload, shotdown) runtime process
  return executeCommand("nodemon", [
    ...getDefaultNodeOptions(),
    "--watch",
    "false",
    GAUDI_SCRIPTS.RUNTIME,
  ]);
}

// --- copy static

function copyStatic(_args: ArgumentsCamelCase, config: EngineConfig) {
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

function dbPush(_args: ArgumentsCamelCase, config: EngineConfig) {
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

function dbReset(args: ArgumentsCamelCase, config: EngineConfig) {
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

function dbPopulate(args: ArgumentsCamelCase<DbPopulateOptions>, _config: EngineConfig) {
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

function dbMigrate(args: ArgumentsCamelCase<DbMigrateOptions>, config: EngineConfig) {
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

function dbDeploy(args: ArgumentsCamelCase<DbMigrateOptions>, config: EngineConfig) {
  console.log(`Deploying DB migrations ...`);

  return executeCommand("npx", [
    "prisma",
    "migrate",
    "deploy",
    `--schema=${getDbSchemaPath(config)}`,
  ]);
}

// ---------- utils

/** Structure that exposes some control over child process while hiding details. */
type ExecuteCommandResult = {
  /** Execute command and return promise that will resolve if process exits nicely and reject if it errs. */
  start: () => Promise<number | null>;
  /** Stop command process. */
  stop: () => boolean;
  /** Send message to command process via IPC. In order for this to work IPC must be enabled in "stdio". */
  sendMessage: (message: string) => void;
  /** Send signal to command process. */
  sendSignal: (signal: NodeJS.Signals) => void;
  /** Check if process is running. */
  isRunning: () => boolean;
};

function executeCommand(command: string, argv: string[]): ExecuteCommandResult {
  console.log(`Command: ${command} ${argv.join(" ")}`);

  // process instance has no indication whether it's running or not so use this flag for that
  let isRunning = false;
  let childProcess: ChildProcess;
  return {
    start: () => {
      return new Promise<number | null>((resolve, reject) => {
        childProcess = spawn(command, argv, {
          env: {
            ...process.env,
          },
          shell: true, // let shell interpret arguments as if they would be when called directly from shell
          stdio: ["inherit", "inherit", "inherit", "ipc"], // allow child processes to use std streams and allow IPC communication
        });

        // should we control child process the same way we control "dev" parent process?
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

        isRunning = true;
      });
    },
    stop: () => {
      if (childProcess == null) {
        console.warn(`Cannot stop command "${command}", process not started yet`);
        return false;
      }

      // tell the process to terminate in a nice way
      // on Windows, where there are no POSIX signals: "[...] process will be killed forcefully and abruptly (similar to'SIGKILL') [...]"
      const successful = !childProcess.kill("SIGTERM");
      isRunning = !successful;

      return successful;
    },
    sendMessage: (message: string) => {
      childProcess.send(message);
    },
    sendSignal: (signal: NodeJS.Signals) => {
      console.log(`KILL child process ${childProcess.pid} using ${signal}`);

      childProcess.kill(signal);
    },
    isRunning: () => isRunning,
  };
}

/** Returns path to prisma schema file */
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

type ResourceWatcherOptions = { debounce?: number } & WatchOptions;

function watchResources(
  target: string | string[],
  callback: () => Promise<void>,
  options?: ResourceWatcherOptions
): Stoppable {
  const {
    /* custom options */
    debounce,
    /* chokidar options */
    ...watcherOptions
  } = options ?? {};

  // prevent event flood
  const debouncedCallback = _.debounce(callback, debounce ?? RESOURCE_WATCH_DELAY);

  const watcher = chokidar
    .watch(target, { ...watcherOptions /* add default options */ })
    // file listeners
    .on("add", debouncedCallback)
    .on("change", debouncedCallback)
    .on("unlink", debouncedCallback)
    // folder listeners
    .on("addDir", debouncedCallback)
    .on("unlinkDir", debouncedCallback)
    // attached all listeners
    .on("ready", debouncedCallback);

  return {
    stop: () => {
      return watcher.close();
    },
  };
}

// ---------- Process control

function attachProcessCleanup(process: NodeJS.Process, cleanup: () => Promise<void> | void) {
  // Listenable signals that terminate the process by default
  // (except SIGQUIT, which generates a core dump and should not trigger cleanup)
  // See https://nodejs.org/api/process.html#signal-events
  const signals = [
    "SIGBREAK", // Ctrl-Break on Windows
    "SIGHUP", // Parent terminal closed
    "SIGINT", // Terminal interrupt, usually by Ctrl-C
    "SIGTERM", // Graceful termination
    "SIGUSR2", // Used by Nodemon
  ];

  async function doCleanup() {
    await cleanup();
  }

  async function cleanupAndExit(code: number) {
    await doCleanup();
    process.exit(code);
  }

  async function cleanupAndKill(signal: string): Promise<void> {
    await doCleanup();
    process.kill(process.pid, signal);
  }

  // --- handlers

  function beforeExitHandler(code: number): void {
    // console.log(`Exiting with code ${code}`);
    void cleanupAndExit(code);
  }

  function uncaughtExceptionHandler(error: Error): void {
    console.error("Uncaught exception", error);
    void cleanupAndExit(1);
  }

  function signalHandler(signal: string): void {
    // console.log(`Exiting due to signal ${signal}`);
    void cleanupAndKill(signal);
  }

  // --- attach/detach handlers

  function attachHandlers() {
    // attach handlers only ONCE to allow normal event handling after we've finished with our cleanup

    process.once("beforeExit", beforeExitHandler);
    process.once("uncaughtException", uncaughtExceptionHandler);
    signals.forEach((signal) => process.once(signal, signalHandler));
  }

  attachHandlers();
}

import { ChildProcess, SpawnOptions, spawn } from "child_process";

import { initLogger } from "@gaudi/compiler";

import { killProcessTree } from "@cli/process";

const logger = initLogger("gaudi:cli:runner");

// -------------------- Command runner

/** Structure that exposes some control over child process while hiding details. */
export type CommandRunner = {
  /** Execute command and return promise that will resolve if process exits nicely and reject if it errs. */
  start: () => Promise<number | null>;
  /** Stop command process. */
  stop: () => Promise<void>;
  /** Check if process is running. */
  isRunning: () => boolean;
};

/** Keep counters for each command name so we can distiguish them when running in parallel. */
const commandCounters: { [key: string]: number } = {};

export function createCommandRunner(
  command: string,
  argv: string[],
  options?: {
    /** Command name for nicer display */
    commandName?: string;
  } & SpawnOptions
): CommandRunner {
  const fullCmd = `${command} ${argv.join(" ")}`;
  const cmdName = options?.commandName ?? `${fullCmd}`;

  // define command counter
  commandCounters[cmdName] = commandCounters[cmdName] ?? 0;
  const cmdCounter = commandCounters[cmdName]++;

  // prepare some display strings
  const displayName = `${cmdName}-${cmdCounter}`;

  // process instance has no indication whether it's running or not so use this flag for that
  let isRunning = false;
  let ph: ChildProcess | undefined;
  return {
    start: () => {
      logger.debug(`[${displayName}] Starting command: ${fullCmd}`);

      isRunning = true;

      return new Promise<number | null>((resolve) => {
        try {
          ph = spawn(command, argv, {
            env: {
              ...process.env,
            },
            shell: true, // let shell interpret arguments as if they would be when called directly from shell
            stdio: ["inherit", "inherit", "inherit"], // allow child processes to use streams
            ...(options ?? {}),
          });

          // process has spawned
          ph.once("spawn", () => {
            logger.debug(`[${displayName}] command started}`);
          });

          // process errored
          ph.on("error", (err) => {
            logger.error(`[${displayName}] command error`, err);

            // resolve but with error code
            resolve(1);

            isRunning = false;
            ph = undefined;
          });

          // process exited
          ph.on("exit", (code) => {
            logger.error(`[${displayName}] command finished (${code})`);

            resolve(code);

            isRunning = false;
            ph = undefined;
          });
        } catch (err) {
          logger.error(`[${displayName}] command start error`, err);
          throw err;
        }
      });
    },
    stop: async () => {
      if (ph == null) {
        throw "Cannot stop command. Process not initialized. Did you call `start()`?";
      }

      if (!isRunning) {
        logger.debug("Stopping process that is not running.");
      }

      return new Promise((resolve, reject) => {
        if (ph != null) {
          // tell the process to terminate in a nice way
          // on Windows, where there are no POSIX signals: "[...] process will be killed forcefully and abruptly (similar to'SIGKILL') [...]"

          logger.debug(`[${displayName}] command stopping: `, ph.pid);

          // commands are called via `npx` and/or via shell so we must kill the entire process tree instead of just one process
          killProcessTree(ph.pid!, "SIGTERM", (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        } else {
          // we've checked if a process handle exists but this is run in async so let's check it again
          logger.error(`[${displayName}] Stopping an inactive command`);
          reject();
        }
      });
    },
    isRunning: () => isRunning,
  };
}

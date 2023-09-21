import { ChildProcessWithoutNullStreams, exec, spawn } from "child_process";

import { initLogger } from "@gaudi/compiler";

const logger = initLogger("gaudi:cli:process");

// ---------- Process control

export function attachProcessCleanup(process: NodeJS.Process, cleanup: () => Promise<void> | void) {
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
    // logger.debug(`Exiting with code ${code}`);
    void cleanupAndExit(code);
  }

  function uncaughtExceptionHandler(error: Error): void {
    logger.error("Uncaught exception", error);
    void cleanupAndExit(1);
  }

  function signalHandler(signal: string): void {
    // logger.debug(`Exiting due to signal ${signal}`);
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

// ---------- Kill process tree

type ProcessInfo = {
  pid: number;
  processed: boolean;
};

/**
 * Kill process together with it's descedants.
 *
 * Traverses down the process tree finding children via parent process id.
 * Pushes all found children to the process list and, once finished, processes that
 * list in reverse order in order to kill leaf processes first up to the root process.
 */
export function killProcessTree(
  pid: number,
  signal: NodeJS.Signals = "SIGTERM",
  callback?: (err?: unknown) => void
): void {
  const processList: ProcessInfo[] = [];

  // add root process to the list
  const rootProcInfo: ProcessInfo = { pid, processed: false };
  processList.push(rootProcInfo);

  switch (process.platform) {
    case "win32":
      exec("taskkill /pid " + pid + " /T /F", callback);
      break;
    case "darwin":
      buildProcessList(
        rootProcInfo,
        processList,
        (parentPid) => {
          return spawn("pgrep", ["-P", `${parentPid}`]);
        },
        () => {
          killAll(processList, signal, callback);
        }
      );
      break;
    default: // Linux
      buildProcessList(
        rootProcInfo,
        processList,
        (parentPid) => {
          return spawn("ps", ["-o", "pid", "--no-headers", "--ppid", `${parentPid}`]);
        },
        () => {
          killAll(processList, signal, callback);
        }
      );
      break;
  }
}

function killAll(
  processList: ProcessInfo[],
  signal: NodeJS.Signals,
  callback?: (err?: unknown) => void
): void {
  try {
    logger.debug(`Killing processes: ${processList.map((pi) => pi.pid).join(", ")}`);
    processList.reverse().forEach((p) => {
      if (!p.processed) {
        killPid(p.pid, signal);
        p.processed = true;
      }
    });

    callback?.();
  } catch (err) {
    if (!callback) {
      throw err;
    }

    callback(err);
  }
}

function killPid(pid: number, signal: NodeJS.Signals) {
  try {
    process.kill(pid, signal);
  } catch (err) {
    // error code when target process doesn't exist
    if ((err as any).code === "ESRCH") {
      console.warn(`Process ${pid} does not exist`);
      return;
    }

    throw err;
  }
}

function buildProcessList(
  parentProcess: ProcessInfo,
  processList: ProcessInfo[],
  spawnChildProcessesList: (pid: number) => ChildProcessWithoutNullStreams,
  cb: () => void
) {
  let allData = "";

  const ps = spawnChildProcessesList(parentProcess.pid);

  // catch list process output
  ps.stdout.on("data", (data) => {
    allData += data.toString("ascii");
  });

  // process list process when output closes
  ps.on("close", (code) => {
    // no more child processes found
    if (code != 0) {
      cb();
      return;
    }

    (allData.match(/\d+/g) ?? [])
      .map((p) => parseInt(p, 10))
      .forEach((pid) => {
        // add proc to the list
        const procInfo: ProcessInfo = { pid, processed: false };
        processList.push(procInfo);

        // find it's children
        buildProcessList(procInfo, processList, spawnChildProcessesList, cb);
      });
  });
}

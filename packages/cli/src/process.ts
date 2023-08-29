import { initLogger } from "@gaudi/compiler";

const logger = initLogger("gaudi:cli");

// -------------------- Process control

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

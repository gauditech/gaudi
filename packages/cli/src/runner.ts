import { ChildProcess, SpawnOptions, spawn } from "child_process";

// -------------------- Command runner

/** Structure that exposes some control over child process while hiding details. */
type CommandRunner = {
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

export function createCommandRunner(
  command: string,
  argv: string[],
  options?: SpawnOptions
): CommandRunner {
  // process instance has no indication whether it's running or not so use this flag for that
  let isRunning = false;
  let childProcess: ChildProcess;
  return {
    start: () => {
      console.log(`Starting command: ${command} ${argv.join(" ")}`);

      return new Promise<number | null>((resolve, reject) => {
        try {
          childProcess = spawn(command, argv, {
            env: {
              ...process.env,
            },
            shell: true, // let shell interpret arguments as if they would be when called directly from shell
            stdio: ["inherit", "inherit", "inherit", "ipc"], // allow child processes to use std streams and allow IPC communication
            ...(options ?? {}),
          });

          // should we control child process the same way we control "dev" parent process?
          childProcess.on("error", (err) => {
            reject(err);
          });
          childProcess.on("exit", (code) => {
            isRunning = false;

            if (code === 0 || code == null) {
              resolve(code);
            } else {
              reject(`Process exited with error code: ${code}`);
            }
          });

          isRunning = true;
        } catch (err) {
          reject(err);
        }
      });
    },
    stop: () => {
      // console.log(`Stopping command: ${command}`);

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
      console.log("Sending message to child process: ", message);

      childProcess.send(message);
    },
    sendSignal: (signal: NodeJS.Signals) => {
      // console.log(`KILL child process ${childProcess.pid} using ${signal}`);

      childProcess.kill(signal);
    },
    isRunning: () => isRunning,
  };
}

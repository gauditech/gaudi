import { AsyncLocalStorage } from "node:async_hooks";
import util from "util";

import chalk from "chalk";
import _ from "lodash";
import { createLogger, format, transports } from "winston";

const als = new AsyncLocalStorage<string[]>();

/**
 * Logger implementation
 */

const winstonLogger = createLogger({
  level: "silly",
  format: format.combine(
    format.timestamp({
      format: "YYYY-MM-DD HH:mm:ss",
    }),
    format.label(),
    format.errors({ stack: true }),
    format.splat(),
    format.align(),
    format.padLevels(),
    format.printf(({ level, label, message, timestamp, stack }) => {
      const cStack = coloredStack(stack);
      const cTimestamp = coloredTs(timestamp);
      const cLevel = coloredLevel(level);
      const cLabel = coloredLabel(label);
      const msg = stack ? "" : padMessage(message);

      return `${cTimestamp} ${cLevel}${cLabel} ${msg}${cStack}`;
    })
  ),
  transports: [new transports.Console({})],
});

type LogLevel = "error" | "warn" | "info" | "verbose" | "debug" | "silly";

interface LogConfig {
  [category: string]: LogLevel;
}

const LOG_CATEGORIES: LogConfig = {
  "": "silly",
  sql: "debug",
  http: "debug",
  debug: "silly",
};

type Loggable = unknown;

export class Logger {
  private _category: string | null = null;
  private _forceLevel: LogLevel | undefined;

  constructor(category?: string, level?: LogLevel) {
    this._category = category ?? null;
    this._forceLevel = level;
  }

  silly(label: Loggable, message: Loggable): void;
  silly(message: Loggable): void;
  silly(...args: Loggable[]) {
    if (args.length > 1) {
      this._log("silly", args[1], args[0]);
    } else {
      // only message is passed
      this._log("silly", args[0], undefined);
    }
  }

  debug(label: Loggable, message: Loggable): void;
  debug(message: Loggable): void;
  debug(...args: Loggable[]) {
    if (args.length > 1) {
      this._log("debug", args[1], args[0]);
    } else {
      // only message is passed
      this._log("debug", args[0], undefined);
    }
  }

  info(label: Loggable, message: Loggable): void;
  info(message: Loggable): void;
  info(...args: Loggable[]) {
    if (args.length > 1) {
      this._log("info", args[1], args[0]);
    } else {
      // only message is passed
      this._log("info", args[0], undefined);
    }
  }

  error(label: Loggable, message: Loggable): void;
  error(message: Loggable): void;
  error(...args: Loggable[]) {
    if (args.length > 1) {
      this._log("error", args[1], args[0]);
    } else {
      // only message is passed
      this._log("error", args[0], undefined);
    }
  }

  wrap<X>(name: string, cb: () => X): X {
    // NOTE: We don't currently implement anything that can utilize `als`
    const ctx = als.getStore();
    const newCtx = [...(ctx ?? []), name];
    return als.run(newCtx, cb) as X;
  }

  static specific(name: string, level?: LogLevel) {
    return new Logger(name, level);
  }

  private _log(level: LogLevel, message: Loggable, label: Loggable | undefined) {
    const minLogLevel = this._forceLevel ?? LOG_CATEGORIES[this._category || ""] ?? "silly";
    if (Logger.compareLevels(level, minLogLevel)) {
      this._do_log(level, message, label);
    }
  }

  protected _do_log(level: LogLevel, message: Loggable, label: Loggable | undefined): void {
    const msgObj =
      message instanceof Error || typeof message === "string"
        ? message
        : util.inspect(message, { depth: 10, colors: true });
    winstonLogger.log(level, msgObj as any, { label });
  }

  private static compareLevels(a: LogLevel, b: LogLevel): boolean {
    const levels: LogLevel[] = ["error", "warn", "info", "verbose", "debug", "silly"];
    return levels.indexOf(a) - levels.indexOf(b) <= 0;
  }
}

const logger = new Logger();
export default logger;

/**
 * Helper functions.
 */

function coloredLevel(level: string): string {
  const l = chalk.bold(chalk.white(` ${level.toUpperCase().padEnd(5)} `));
  switch (level) {
    case "silly": {
      return chalk.bgYellow(l);
    }
    case "debug": {
      return chalk.bgBlue(l);
    }
    case "info": {
      return chalk.bgGreen(l);
    }
    case "error": {
      return chalk.bgRed(l);
    }
    default: {
      return level;
    }
  }
}

function coloredTs(ts: string): string {
  return chalk.bold(`[${ts}]`);
}

function coloredStack(stack: string): string {
  if (!stack) {
    return "";
  }
  const [err, ...s] = stack.split("\n").map((line) => `${_.repeat("\t", 2)}${line}`);
  return `${chalk.bold(chalk.red(err))}\n${chalk.gray(s.join("\n"))}`;
}

function coloredLabel(label: string | undefined): string {
  return label ? chalk.bgGray(chalk.yellowBright(chalk.bold(`[${label}]`))) : "";
}

function padMessage(msg: string): string {
  return msg
    .split("\n")
    .map((line, index) => (index > 0 ? `\t\t${line}` : line))
    .join("\n");
}

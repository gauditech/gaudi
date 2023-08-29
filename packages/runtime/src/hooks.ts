import path from "path";

import { initLogger } from "@gaudi/compiler";
import { getExecutionRuntimeDefinition } from "@gaudi/compiler/dist/common/refs";
import { getInternalExecutionRuntimeName } from "@gaudi/compiler/dist/composer/executionRuntimes";
import { HookCode, HookInline, HookSource } from "@gaudi/compiler/dist/types/common";
import { Definition, ExecutionRuntimeDef } from "@gaudi/compiler/dist/types/definition";
import { Request, Response } from "express";

const logger = initLogger("gaudi:runtime:hooks");
const EXECUTION_RUNTIMES: Record<string, ExecutionRuntimeClient> = {};

/**
 * Executes hook.
 *
 * This is used in model/validator/setter hooks which all work
 * with gaudi-controlled arguments.
 */
export async function executeHook<T>(
  def: Definition,
  hook: HookCode,
  args: Record<string, unknown>
): Promise<T> {
  if (hook.kind === "inline") return executeInlineHook(hook, args);
  const execRuntime = getExecutionRuntimeDefinition(def, hook.runtimeName);
  return (await createExecutionRuntime(execRuntime)).executeHook<T>(hook, args);
}

/**
 * Executes action hook.
 *
 * Action hooks are used to provide action implementation. They can receive gaudi-controlled
 * arguments but also, they need access to low level abstractions and that's why they
 * receive other objects like eg. request/response.
 */
export async function executeActionHook<T>(
  def: Definition,
  hook: HookCode,
  args: Record<string, unknown>,
  ctx: {
    request: Request;
    response: Response;
  }
): Promise<T> {
  if (hook.kind === "inline") return executeInlineHook(hook, args);
  const execRuntime = getExecutionRuntimeDefinition(def, hook.runtimeName);
  return (await createExecutionRuntime(execRuntime)).executeHook<T>(hook, args, ctx);
}

/**
 * Executes inline hook.
 *
 * Inline hook is seperate because it can be executed without named runtime environment.
 */
export async function executeInlineHook<T>(
  hook: HookInline,
  args: Record<string, unknown>
): Promise<T> {
  // order of args must be consistent
  const argNames = Object.entries(args).map(([name, _value]) => name);
  const argValues = Object.entries(args).map(([_name, value]) => value);
  const hookBody = [
    // strict mode
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode
    "'use strict'",
    // hook fn body
    `return ${hook.inline}`,
  ].join("\n");

  // dynamically create new function
  // allows access only to global and function's own scope
  // syntax is `new AsyncFunction(arg1, ..., argN, fnBody)`
  // arguments are positional so order in fn definition (here) and in fn call (below) must be the same
  const hookFn = new AsyncFunction(...[...argNames, hookBody]);

  // TODO: cache inline function - by which key, source code?!

  return hookFn(...argValues);
}

async function createExecutionRuntime(
  runtime: ExecutionRuntimeDef
): Promise<ExecutionRuntimeClient> {
  if (EXECUTION_RUNTIMES[runtime.name] == null) {
    // only local gaudi execution runtime is supported at the moment
    EXECUTION_RUNTIMES[runtime.name] = await createLocalExecutionRuntime(runtime);
  }

  return EXECUTION_RUNTIMES[runtime.name];
}

// ---------- Local execution runtime

export type HookActionContext = { request: Request; response: Response };
export type HookFunction = <T>(
  args: Record<string, unknown>,
  ctx?: HookActionContext
) => Promise<T>;
export type HookModules = Record<string, Record<string, HookFunction>>;

export type ExecutionRuntimeClient = {
  runtimeName: string;
  executeHook: <T>(
    hook: HookSource,
    args: Record<string, unknown>,
    ctx?: HookActionContext
  ) => Promise<T>;
};

function loadModule(root: string, file: string, modules: HookModules) {
  if (modules[file]) {
    return modules[file];
  }
  const fullPath = path.join(root, file);

  try {
    const contents = loadFileAsModule(fullPath);
    modules[file] = contents;
    return contents;
  } catch (_) {
    const err = `Hook file "${file}" not found (${fullPath})`;
    logger.error(err);
    throw new Error(err);
  }
}

export async function createLocalExecutionRuntime(
  runtime: ExecutionRuntimeDef
): Promise<ExecutionRuntimeClient> {
  const modules: HookModules = {};

  const sourcePath = resolveSourcePath(runtime.name, runtime.sourcePath);

  return {
    runtimeName: runtime.name,
    executeHook(hook, args, ctx) {
      const hookFile = loadModule(sourcePath, hook.file, modules);
      const hookFn = hookFile[hook.target];
      if (hookFn == null) {
        const err = `Hook "${hook.target}" in file "${hook.file}" not found`;
        logger.error(err);
        throw new Error(err);
      }

      logger.debug(`Running hook ${hook.file}::${hook.target}`);
      return (async () => {
        try {
          const result = await hookFn(args, ctx);
          logger.debug(`Hook ${hook.file}::${hook.target} finished successfully: %O`, result);
          return result;
        } catch (e: any) {
          logger.error(`Hook ${hook.file}::${hook.target} failed: %O`, {
            message: e.message,
            stack: e.stack,
          });
          throw e;
        }
      })();
    },
  };
}

/**
 * Resolves absolute source folder path.
 *
 * If sources path is already absolute it is returned as umchanged.
 *
 * Relative paths are resolved with different base path:
 *  - internal exec runtimes are resolved using `__dirname` as base path
 *  - user defined exec runtimes are resolved using current process working folder
 */
function resolveSourcePath(name: string, sourcePath: string): string {
  if (path.isAbsolute(sourcePath)) return sourcePath;

  const internalExecRuntimes = [getInternalExecutionRuntimeName()];
  if (internalExecRuntimes.includes(name)) {
    return path.resolve(__dirname, sourcePath);
  } else {
    return path.resolve(sourcePath);
  }
}

function loadFileAsModule(filepath: string) {
  const absolute = path.resolve(filepath);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(absolute);
}

// we cannot dynamically create async function using `new Function()` so we'll hijack real async function's prototype to create a new one dynamically
const AsyncFunction = Object.getPrototypeOf(async function () {
  // empty body
}).constructor;

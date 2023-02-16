import { promises as fs } from "fs";
import path from "path";

import { getExecutionRuntime } from "@src/common/refs";
import { getInternalExecutionRuntimeName } from "@src/composer/executionRuntimes";
import { Definition, ExecutionRuntimeDef, HookCodeDef, HookDef } from "@src/types/definition";

export type ExecutionRuntimeClient = {
  runtimeName: string;
  executeHook: <T>(hook: HookCodeDef, args: Record<string, unknown>) => T;
};

const EXECUTION_RUNTIMES: Record<string, ExecutionRuntimeClient> = {};

export async function executeHook<T>(
  def: Definition,
  hook: HookDef,
  args: Record<string, unknown>
): Promise<T> {
  const execRuntime = getExecutionRuntime(def, hook.runtimeName);
  return (await createExecutionRuntime(execRuntime)).executeHook<T>(hook.code, args);
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

export type HookModules = Record<string, Record<string, (_: unknown) => unknown>>;

const HOOKS_FILES_PATTERN = /.+\.[tj]s$/;

export async function createLocalExecutionRuntime(
  runtime: ExecutionRuntimeDef
): Promise<ExecutionRuntimeClient> {
  const modules: HookModules = {};

  const sourcePath = resolveSourcePath(runtime.name, runtime.sourcePath);
  await importHooks(sourcePath, modules);

  return {
    runtimeName: runtime.name,
    executeHook(code, args) {
      switch (code.kind) {
        case "inline": {
          // order of args must be consistent
          const argNames = Object.entries(args).map(([name, _value]) => name);
          const argValues = Object.entries(args).map(([_name, value]) => value);
          const hookBody = [
            // strict mode
            // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode
            "'use strict'",
            // hook fn body
            `return ${code.inline}`,
          ].join("\n");

          // dynamically create new function
          // allows access only to global and function's own scope
          // syntax is `new AsyncFunction(arg1, ..., argN, fnBody)`
          // arguments are positional so order in fn definition (here) and in fn call (below) must be the same
          const hookFn = new AsyncFunction(...[...argNames, hookBody]);

          // TODO: cache inline function - by which key, source code?!

          return hookFn(...argValues);
        }
        case "source": {
          const hookFile = modules[code.file];
          if (hookFile == null) {
            throw new Error(`Hook file "${code.file}" not found`);
          }

          const hook = hookFile[code.target];
          if (hook == null) {
            throw new Error(`Hook "${code.target}" in file "${code.file}" not found`);
          }

          return hook(args);
        }
      }
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

async function importHooks(sourcePath: string, modules: HookModules) {
  console.log("Loading hooks sources from:", path.resolve(sourcePath));

  async function loadHooksFromDir(dir: string) {
    const entities = await fs.readdir(path.join(sourcePath, dir));

    const promises = entities.map(async (entityFilename) => {
      const hookPath = path.join(dir, entityFilename);
      const entity = path.join(sourcePath, hookPath);

      const stats = await fs.lstat(entity);

      if (stats.isDirectory()) {
        await loadHooksFromDir(hookPath);
      } else if (stats.isFile() && HOOKS_FILES_PATTERN.test(entityFilename)) {
        modules[hookPath] = loadFileAsModule(entity);
      }
    });

    await Promise.all(promises);
  }

  await loadHooksFromDir("");
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

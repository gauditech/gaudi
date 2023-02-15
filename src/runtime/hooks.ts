import { promises as fs } from "fs";
import path from "path";

import { HookDef } from "@src/types/definition";

export type HookModules = Record<string, Record<string, (...args: unknown[]) => unknown>>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const modules: HookModules = {};

const HOOKS_FILES_PATTERN = /.+\.[tj]s$/;

export async function importHooks(hookFolder: string) {
  const hooksOutput = path.join(hookFolder);

  async function loadHooksFromDir(dir: string) {
    const entities = await fs.readdir(path.join(hooksOutput, dir));

    const promises = entities.map(async (entityFilename) => {
      const hookPath = path.join(dir, entityFilename);
      const entity = path.join(hooksOutput, hookPath);

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

export async function executeHook(hook: HookDef, args: Record<string, unknown>) {
  switch (hook.code.kind) {
    case "inline": {
      // order of args must be consistent
      const argNames = Object.entries(args).map(([name, _value]) => name);
      const argValues = Object.entries(args).map(([_name, value]) => value);
      const hookBody = [
        // strict mode
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode
        "'use strict'",
        // hook fn body
        `return ${hook.code.inline}`,
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
      //
      const hookFn = modules[hook.code.file][hook.code.target];
      if (hookFn == null) {
        throw new Error(`Hook "${hook.code.target}" in file "${hook.code.file}" not found`);
      }

      return hookFn(args);
    }
  }
}

// we cannot dynamically create async function using `new Function()` so we'll hijack real async function's prototype to create a new one dynamically
const AsyncFunction = Object.getPrototypeOf(async function () {
  // empty body
}).constructor;

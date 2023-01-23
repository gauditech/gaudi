import { promises as fs } from "fs";
import path from "path";

import { HookCode } from "@src/types/specification";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const modules: Record<string, any> = {};

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

export function executeHook(code: HookCode, args: Record<string, unknown>) {
  switch (code.kind) {
    case "inline": {
      const argString = Object.entries(args)
        .map(([name, value]) => `const ${name} = ${JSON.stringify(value)};`)
        .join("");

      return eval(`${argString}${code.inline}`);
    }
    case "source": {
      const hook = modules[code.file][code.target];
      return hook(args);
    }
  }
}

import { promises as fs } from "fs";
import path from "path";

import { HookCode } from "@src/types/specification";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const modules: Record<string, any> = {};

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
      } else if (stats.isFile()) {
        modules[hookPath] = await loadFileAsModule(entity);
      }
    });

    await Promise.all(promises);
  }

  await loadHooksFromDir("");
}

async function loadFileAsModule(path: string) {
  const content = await fs.readFile(path);
  const _encodedContent = "data:text/javascript;base64," + content.toString("base64");

  return await eval("import(_encodedContent)");
}

export function executeHook(code: HookCode, args: Record<string, unknown>) {
  switch (code.kind) {
    case "inline": {
      const argString = Object.entries(args)
        .map(([name, value]) => `const ${name} = ${JSON.stringify(value)};`)
        .join();
      return eval(`${argString}${code.inline}`);
    }
    case "source": {
      const hook = modules[code.file][code.target];
      return hook(args);
    }
  }
}

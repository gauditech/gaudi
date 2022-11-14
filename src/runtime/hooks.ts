import { promises as fs } from "fs";
import path from "path";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const modules: Record<string, any> = {};

export async function importHooks(outputFolder: string) {
  const hooksOutput = path.join(outputFolder, "hooks");

  async function loadHooksFromDir(dir: string) {
    const entities = await fs.readdir(path.join(hooksOutput, dir));

    entities.forEach(async (entityFilename) => {
      const hookPath = path.join(dir, entityFilename);
      const entity = path.join(hooksOutput, hookPath);

      const stats = await fs.lstat(entity);

      if (stats.isDirectory()) {
        await loadHooksFromDir(hookPath);
      } else if (stats.isFile()) {
        modules[hookPath] = await loadFileAsModule(entity);
      }
    });
  }

  await loadHooksFromDir("");
}

async function loadFileAsModule(path: string) {
  const content = await fs.readFile(path);
  const _encodedContent = "data:text/javascript;base64," + content.toString("base64");

  return await eval("import(_encodedContent)");
}

export function getHook(file: string, target: string) {
  return modules[file][target];
}

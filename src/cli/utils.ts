import fs from "fs";
import path from "path";

import pkgDir from "pkg-dir";

import { saveOutputFile } from "@src/common/utils";

export function sanitizeProjectName(name: string): string {
  return (
    name
      // allow only word characters, replace all others with "-"
      .replace(/\W/g, "-")
      // remove multiple consecutive "-"
      .replace(/-{2,}/g, "-")
      // remove start/end "-"
      .replace(/^-+|-+$/, "")
  );
}

/** Find root directory of a nodejs project or npm package. */
export function resolveProjectPath() {
  return pkgDir.sync();
}

/** Find path to nodejs project module. */
export function resolveModulePath(module: string) {
  return path.resolve(resolveProjectPath() ?? "", "node_modules", module);
}

/** Create dir recursively if it doesn't exist already */
export function createDir(path: string) {
  // clear output folder
  if (!pathExists(path)) {
    // (re)create output folder
    fs.mkdirSync(path, { recursive: true });
  }
}

export function storeTemplateOutput(destination: string, content: string): void {
  saveOutputFile(destination, content);
}

export function pathExists(path: string) {
  return fs.existsSync(path);
}

export function copyPath(src: string, dest: string) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    copyDir(src, dest);
  } else {
    fs.copyFileSync(src, dest);
  }
}

export function copyDir(srcDir: string, destDir: string) {
  fs.mkdirSync(destDir, { recursive: true });

  for (const file of fs.readdirSync(srcDir)) {
    const srcFile = path.resolve(srcDir, file);
    const destFile = path.resolve(destDir, file);

    copyPath(srcFile, destFile);
  }
}
export function readFile(path: string) {
  return fs.readFileSync(path, "utf-8");
}

export function writeFile(path: string, content: string) {
  fs.writeFileSync(path, content);
}

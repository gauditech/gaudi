import fs from "fs";

import { saveOutputFile } from "@src/common/utils";

export function verifyProjectName(name: string): string {
  // TODO: allow only ascii characters
  return name;
}

/** Create dir recursively if it doesn't exist already */
export function createDir(path: string) {
  // clear output folder
  if (!fs.existsSync(path)) {
    // (re)create output folder
    fs.mkdirSync(path, { recursive: true });
  }
}

export function storeTemplateOutput(destination: string, content: string): void {
  saveOutputFile(destination, content);
}

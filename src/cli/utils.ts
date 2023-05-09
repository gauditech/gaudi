import fs from "fs";

import { saveOutputFile } from "@src/common/utils.js";

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

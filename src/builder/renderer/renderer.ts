import fs from "fs";
import path from "path";

import * as Eta from "eta";

export function render(
  srcFilename: string,
  destFilename: string,
  data?: Record<string, unknown>
): Promise<void> {
  return renderTemplate(srcFilename, data).then((content) => {
    storeTemplateOutput(destFilename, content);
  });
}

export function renderTemplate(
  filename: string,
  data: Record<string, unknown> = {}
): Promise<string> {
  return Eta.renderFileAsync(filename, data) || Promise.resolve("");
}

export function storeTemplateOutput(filename: string, content: string): void {
  // create folder(s) if they don't exist
  const dir = path.dirname(filename);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // write file
  fs.writeFileSync(filename, content, { encoding: "utf-8" });
}

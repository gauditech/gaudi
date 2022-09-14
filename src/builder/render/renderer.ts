import fs from "fs";
import path from "path";

import * as Eta from "eta";

Eta.configure({
  views: path.join(__dirname),
});

export function render(srcFilename: string, destFilename: string, data?: unknown): Promise<void> {
  return renderTemplate(srcFilename, data).then((content) => {
    storeTemplateOutput(destFilename, content);
  });
}

function renderTemplate(filename: string, data?: unknown): Promise<string> {
  return Eta.renderFileAsync(filename, data) || Promise.resolve("");
}

function storeTemplateOutput(filename: string, content: string): void {
  fs.writeFileSync(filename, content, { encoding: "utf-8" });
}

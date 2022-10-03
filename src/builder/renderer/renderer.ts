import fs from "fs";
import path from "path";

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
  return import(filename).then((m) => m.render(data));
}

export function renderTsTemplate(
  filename: string,
  data: Record<string, unknown> = {}
): Promise<string> {
  return import(filename).then((template) => {
    return template.render(data);
  });
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

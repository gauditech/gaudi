import { saveOutputFile } from "@src/common/utils";

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
  return import(filename).then((template) => {
    return template.render(data);
  });
}

export function storeTemplateOutput(destination: string, content: string): boolean {
  return saveOutputFile(destination, content);
}

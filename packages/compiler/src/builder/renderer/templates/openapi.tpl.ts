import { buildOpenAPI } from "@compiler/builder/openAPI";
import { Definition } from "@compiler/types/definition";

export function render(def: Definition): string {
  const openApi = buildOpenAPI(def);

  return JSON.stringify(openApi, undefined, 2);
}

import { buildOpenAPI } from "@compiler/builder/openAPI";
import { Definition } from "@compiler/types/definition";

export type OpenApiBuilderData = {
  definition: Definition;
  basePath?: string;
};

export function render(data: OpenApiBuilderData): string {
  const openApi = buildOpenAPI(data.definition, data.basePath);

  return JSON.stringify(openApi, undefined, 2);
}

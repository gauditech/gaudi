import path from "path";

import { buildOpenAPI } from "@src/builder/openAPI";
import { saveOutputFile } from "@src/common/utils";
import { buildAdminEntrypoints } from "@src/runtime/server/admin";
import { Definition } from "@src/types/definition";

export function buildAdminApi(def: Definition, outputFolder: string) {
  const adminDefinition = buildAdminEntrypoints(def);

  const openApi = buildOpenAPI({ models: def.models, entrypoints: adminDefinition });

  const outFile = path.join(outputFolder, "admin.openapi.json");
  saveOutputFile(outFile, JSON.stringify(openApi, undefined, 2));

  console.info(`Created admin API in ${outFile}`);
}

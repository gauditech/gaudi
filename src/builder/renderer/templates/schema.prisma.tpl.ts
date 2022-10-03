import {
  fieldDbName,
  modelDbName,
  typeToDbType,
} from "@src/builder/renderer/templates/util/definition";
import { Definition } from "@src/types/definition";
import { oneLine, source } from "common-tags";

export type BuildDbSchemaData = {
  definition: Definition;
  dbProvider: string;
  dbConnectionUrl: string;
};

export function render(data: BuildDbSchemaData): string {
  const d = data.definition;

  // prettier-ignore
  return source`
    ${ /* TODO: datasource should come from definition instead of being hardcoded */'' }
    datasource db {
      provider = "${data.dbProvider}"
      url      = "${data.dbConnectionUrl}"
    }

    ${d.models.map(
      (model) => source`
        model ${model.dbname} {
        ${(model.fields || []).map(
          (field) => oneLine`
            ${field.dbname}
              ${typeToDbType(field.dbtype)}${field.nullable ? "?" : ""}
              ${field.primary ? "@id" : ""}
              ${field.unique ? "@unique" : ""}
              ${field.dbtype === "serial" ? "@default(autoincrement())" : ""}
          `)}

        ${(model.relations ?? []).map(
          (relation) => oneLine`
          ${relation.name}
            ${modelDbName(relation.fromModelRefKey, d)}${!relation.unique ? "[]" : ""}${relation.nullable ? "?" : ""}
        `)}

        ${(model.references ?? []).map(
          (reference) => oneLine`
            ${reference.name}
              ${modelDbName(reference.toModelRefKey, d)}
              @relation(fields: [${fieldDbName(reference.modelRefKey, reference.fieldRefKey, d)}], references: [${fieldDbName(reference.toModelRefKey, reference.toModelFieldRefKey, d)}])
        `)}
        }
      `
    )}

  `;
}

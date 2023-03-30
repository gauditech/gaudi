import { oneLine, source } from "common-tags";

import { getFieldDbType, getRef } from "@src/common/refs";
import { Definition } from "@src/types/definition";

export type BuildDbSchemaData = {
  definition: Definition;
  dbProvider: string;
};

export function render(data: BuildDbSchemaData): string {
  const d = data.definition;

  // prettier-ignore
  return source`
    ${ /* TODO: datasource should come from definition instead of being hardcoded */'' }
    datasource db {
      provider = "${data.dbProvider}"
      url      = env("GAUDI_DATABASE_URL")
    }

    ${d.models.map(
      (model) => source`
        model ${model.dbname} {
        ${(model.fields || []).map(
          (field) => oneLine`
            ${field.dbname}
              ${ getFieldDbType(field.dbtype)}${field.nullable ? "?" : ""}
              ${field.primary ? "@id" : ""}
              ${field.unique ? "@unique" : ""}
              ${field.dbtype === "serial" ? "@default(autoincrement())" : ""}
          `)}

        ${(model.relations ?? []).map(
          (relation) => oneLine`
          ${relation.name}
            ${getRef.model(d, relation.fromModelRefKey).dbname}${!relation.unique ? "[]" : ""}${relation.unique && relation.nullable ? "?" : ""}
          @relation("${relation.fromModel}${relation.through}")
        `)}

        ${(model.references ?? []).map(
          (reference) => oneLine`
            ${reference.name}
              ${getRef.model(d, reference.toModelRefKey).dbname}${reference.nullable ? "?" : ""}
              @relation("${reference.modelRefKey}${reference.name}", fields: [${getRef.field(d, reference.fieldRefKey).dbname}], references: [${getRef.field(d, reference.toModelFieldRefKey).dbname}])
        `)}
        }
      `
    )}

  `;
}

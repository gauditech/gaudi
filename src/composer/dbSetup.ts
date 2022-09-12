import { findField } from "./refs";
import { Blueprint } from "./types/blueprint";
import { Field, Model, Reference } from "./types/model";

export function setupDb(bp: Blueprint): string {
  const creates = createTables(bp);
  const fks = createFks(bp);
  return ["-- CREATE TABLES", creates, "-- FOREIGN KEYS", fks].join("\n\n\n");
}

function createTables(bp: Blueprint): string {
  return Object.values(bp.models).map(createTable).join("\n\n");
}
function createTable(model: Model): string {
  const fieldMaxLen = Math.max(...model.fields.map((f) => f.dbname.length));
  const fieldTab = 4 * Math.ceil(1 + fieldMaxLen / 4);
  const fieldDefs = model.fields
    .map((f) => createTableField(f, fieldTab))
    .join(",\n");
  return `\
CREATE TABLE ${model.dbname} (
${fieldDefs}
);`;
}

function createTableField(f: Field, tab: number): string {
  const nullableStr = f.type === "serial" ? "" : f.nullable ? "" : " NOT NULL";
  const dbTypeStr = getFieldDbType(f);
  const defaultStr = getDefaultStr(f);
  return `    ${f.dbname.padEnd(
    tab,
    " "
  )} ${dbTypeStr}${nullableStr}${defaultStr}`;
}

function getFieldDbType(f: Field): string {
  switch (f.type) {
    case "serial":
      return "serial PRIMARY KEY";
    case "string":
      return "text";
    case "integer":
      return "int";
    case "datetime":
      return "timestamp";
  }
}

function getDefaultStr(f: Field): string {
  if (f.type === "serial") return "";
  // if (f.default) return `DEFAULT ${f.default}`;
  switch (f.type) {
    case "string":
      return " DEFAULT ''";
    case "datetime":
    case "integer":
      return "";
  }
}

function createFks(bp: Blueprint): string {
  const references = Object.values(bp.models).flatMap((m) => m.references);
  const updates = references.map((reference) => createFk(reference, bp));
  return updates.join("\n\n");
}

function createFk(reference: Reference, bp: Blueprint): string {
  const field = findField(bp, reference.fieldRef);
  const model = bp.models[field.modelRef];
  const targetField = findField(bp, reference.targetFieldRef);
  const targetModel = bp.models[targetField.modelRef];
  return `\
ALTER TABLE ${model.dbname} \
ADD CONSTRAINT fk_${field.dbname} \
FOREIGN KEY (${field.dbname}) \
REFERENCES ${targetModel.dbname}(${targetField.dbname}) \
ON DELETE NO ACTION \
ON UPDATE CASCADE;`;
}

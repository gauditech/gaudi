import { Definition } from "./types/definition";
import { Field, Model, Reference } from "./types/model";

export function setupDb(definition: Definition): string {
  const creates = createTables(definition);
  const fks = createFks(definition);
  return ["-- CREATE TABLES", creates, "-- FOREIGN KEYS", fks].join("\n\n\n");
}

function createTables(def: Definition): string {
  return Object.values(def.models).map(createTable).join("\n\n");
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
      return "serial";
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

function createFks(def: Definition): string {
  const references = Object.values(def.models).flatMap((m) => m.references);
  const updates = references.map((reference) => createFk(reference, def));
  return updates.join("\n\n");
}

function createFk(reference: Reference, def: Definition): string {
  const field = def.fields[reference.fieldRef];
  const model = def.models[field.modelRef];
  const targetField = def.fields[reference.targetFieldRef];
  const targetModel = def.models[targetField.modelRef];
  return `\
ALTER TABLE ${model.dbname} \
ADD CONSTRAINT fk_${field.dbname} \
FOREIGN_KEY (${field.dbname}) \
REFERENCES ${targetModel.dbname}(${targetField.dbname}) \
ON DELETE NO ACTION \
ON UPDATE CASCADE;`;
}

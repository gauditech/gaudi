import { Definition, FieldDef, ModelDef } from "src/types/definition";
import { FieldSpec, ModelSpec, Specification } from "src/types/specification";

export function compose(input: Specification): Definition {
  return {
    models: composeModels(input.models),
  };
}

function composeModels(inputModels: ModelSpec[]): ModelDef[] {
  // TODO: ensure model names are unique
  // step 1: model + fields

  let models = inputModels.map((model) => ({
    refKey: model.name,
    name: model.name,
    dbname: model.name.toLowerCase(),
    fields: composeFields(model.fields, model.name),
    references: [],
    relations: [],
  }));

  // step 2: references
  // step 3: relations

  return models;
}

function composeFields(fields: FieldSpec[], modelRefKey: string): FieldDef[] {
  return fields.map((field) => ({
    refKey: `${modelRefKey}.${field.name}`,
    modelRefKey,
    name: field.name,
    dbname: field.name.toLowerCase(),
    type: validateType(field.type),
    dbtype: constructDbType(validateType(field.type)),
    primary: false,
    unique: !!field.unique,
    nullable: !!field.nullable,
  }));
}

function validateType(type: string): FieldDef["type"] {
  switch (type) {
    case "integer":
      return "integer";
    case "text":
      return "text";
    case "boolean":
      return "boolean";
    default:
      throw new Error(`Field type ${type} is not a valid type`);
  }
}

function constructDbType(type: FieldDef["type"]): FieldDef["dbtype"] {
  return type;
}

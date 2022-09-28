import { ensureFind, ensureUnique } from "@src/common/utils";
import { Definition, FieldDef, ModelDef, ReferenceDef, RelationDef } from "@src/types/definition";
import { FieldSpec, ModelSpec, Specification } from "@src/types/specification";

export function compose(input: Specification): Definition {
  return {
    models: composeModels(input.models),
  };
}

function composeModels(specs: ModelSpec[]): ModelDef[] {
  // ensure model names are unique
  ensureUnique(specs.map((m) => m.name));

  // step 1: model + fields
  let models = specs.map((model) => ({
    refKey: model.name,
    name: model.name,
    dbname: model.name.toLowerCase(),
    fields: composeModelFields(model.fields, model.name),
    references: [] as ReferenceDef[],
    relations: [] as RelationDef[],
  }));

  // step 2: references
  models = composeReferences(models, specs);
  // step 3: relations
  models = composeRelations(models, specs);

  return models;
}

function composeModelFields(fields: FieldSpec[], modelRefKey: string): FieldDef[] {
  const fieldDefs = fields.map((field) => ({
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
  const id: FieldDef = {
    refKey: `${modelRefKey}.id`,
    modelRefKey,
    name: "id",
    dbname: "id",
    type: "integer",
    dbtype: "serial",
    primary: true,
    unique: true,
    nullable: false,
  };
  // ensure field names are unique, including the `id` field
  const allFieldDefs = [id, ...fieldDefs];
  ensureUnique(allFieldDefs.map((f) => f.name));
  ensureUnique(allFieldDefs.map((f) => f.dbname));
  return allFieldDefs;
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

function composeReferences(models: ModelDef[], specs: ModelSpec[]): ModelDef[] {
  return models.map((model) => {
    // find the spec
    const spec = ensureFind(specs, (spec) => spec.name === model.name);
    const references = spec.references.map((ref): ReferenceDef => {
      const refModel = ensureFind(models, (m) => m.name === ref.toModel);
      const refField = ensureFind(refModel.fields, (f) => f.name === "id");

      return {
        refKey: `${model.refKey}.${ref.name}`,
        name: ref.name,
        modelRefKey: model.refKey,
        fieldRefKey: `${model.refKey}.${ref.name}_id`,
        toModelRefKey: refModel.refKey,
        toModelFieldRefKey: refField.refKey,
        nullable: !!ref.nullable,
        unique: !!ref.unique,
      };
    });

    const refFields = references.map(
      (ref): FieldDef => ({
        refKey: ref.fieldRefKey,
        name: `${ref.name}_id`,
        dbname: `${ref.name}_id`.toLowerCase(),
        type: "integer",
        dbtype: "integer",
        nullable: ref.nullable,
        unique: ref.unique,
        primary: false,
        modelRefKey: ref.modelRefKey,
      })
    );

    // ensure no name collisions between model fields, references and reference fields
    ensureUnique([
      ...refFields.map((f) => f.name),
      ...references.map((r) => r.name),
      ...model.fields.map((f) => f.name),
    ]);
    // ensure no dbname collisions between reference fields and regular fields
    ensureUnique([...refFields.map((f) => f.dbname), ...model.fields.map((f) => f.dbname)]);

    return { ...model, fields: [...model.fields, ...refFields], references };
  });
}

function composeRelations(models: ModelDef[], specs: ModelSpec[]): ModelDef[] {
  return models.map((model) => {
    const spec = ensureFind(specs, (spec) => spec.name === model.name);
    const relations = spec.relations.map((rel): RelationDef => {
      const relModel = ensureFind(models, (m) => m.name === rel.fromModel);
      const relReference = ensureFind(relModel.references, (ref) => ref.name === rel.through);
      return {
        refKey: `${model.refKey}.${rel.name}`,
        modelRefKey: model.refKey,
        name: rel.name,
        fromModel: rel.fromModel,
        fromModelRefKey: relModel.refKey,
        through: rel.through,
        throughRefKey: relReference.refKey,
        nullable: relReference.nullable,
        unique: relReference.unique,
      };
    });
    ensureUnique([
      ...model.fields.map((f) => f.name),
      ...model.references.map((r) => r.name),
      ...relations.map((r) => r.name),
    ]);
    return { ...model, relations };
  });
}

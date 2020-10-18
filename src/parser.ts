import { Definition } from "./types/definition";
import {
  BaseModel,
  Field,
  FieldDef,
  Model,
  ModelDef,
  Reference,
  ReferenceDef,
  RefModel,
} from "./types/model";

export function readDefinition(modelDefs: ModelDef[]): Definition {
  const models = constructModels(modelDefs);
  return { models };
}

function constructModels(modelDefs: ModelDef[]): Model[] {
  // Phase 0: get model definition as param
  // Phase 1: define basic model fields, calculate optionals
  const baseModels = constructBaseModels(modelDefs);
  // Phase 2: build field references
  const refModels = constructRefModels(baseModels);
  return refModels;
}

function constructBaseModels(modelDefs: ModelDef[]): BaseModel[] {
  return modelDefs.map((def: ModelDef) => ({
    ...def,
    idname: def.idname ?? "id",
    dbname: def.dbname ?? def.name,
    fields: def.fields.map(constructField),
    references: def.references ?? [],
  }));
}

function constructRefModels(baseModels: BaseModel[]): RefModel[] {
  return baseModels.map((baseModel) => {
    const references = baseModel.references.map((refDef) =>
      constructReference(refDef, baseModels)
    );
    return {
      ...baseModel,
      references,
    };
  });
}

function constructReference(
  refDef: ReferenceDef,
  baseModels: BaseModel[]
): Reference {
  const model = baseModels.find((m) => m.name === refDef.model)!; // TODO: Throw
  const defaultFieldName = `${refDef.name}_${model.idname}`;
  const fieldName = refDef.fieldName ?? defaultFieldName;
  const fieldDbName = refDef.fieldDbName ?? fieldName;
  const modelFieldName = refDef.modelFieldName ?? model.idname;
  const targetField = model.fields.find((f) => f.name === modelFieldName)!; // TODO: Throw
  const modelFieldDbName = targetField.dbname;
  return {
    ...refDef,
    fieldName,
    fieldDbName,
    modelFieldName,
    modelFieldDbName,
  };
}

function constructField(def: FieldDef): Field {
  return {
    ...def,
    dbname: def.dbname ?? def.name,
    nullable: def.nullable ?? false,
  };
}

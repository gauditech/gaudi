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
  const fieldMap = Object.fromEntries(
    models.flatMap((m) => m.fields).map((f) => [f.selfRef, f])
  );
  const modelMap = Object.fromEntries(models.map((m) => [m.selfRef, m]));
  return { models: modelMap, fields: fieldMap };
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
  return modelDefs.map((def: ModelDef) => {
    const modelRef = def.name;
    const idField: Field = {
      selfRef: `${modelRef}.id`,
      modelRef,
      name: "id",
      type: "serial",
      dbname: "id",
      nullable: false,
    };
    return {
      ...def,
      selfRef: modelRef,
      dbname: def.name.toLowerCase(),
      fields: [
        idField,
        ...def.fields.map((fieldDef) => constructField(fieldDef, modelRef)),
      ],
      referenceDefs: def.references ?? [],
    };
  });
}

function constructField(def: FieldDef, modelRef: string): Field {
  return {
    ...def,
    selfRef: `${modelRef}.${def.name}`,
    modelRef,
    dbname: def.name,
    nullable: def.nullable ?? false,
  };
}

function constructRefModels(baseModels: BaseModel[]): RefModel[] {
  return baseModels.map((baseModel) => {
    const fieldReferenceTuples = baseModel.referenceDefs.map((refDef) =>
      constructReference(refDef, baseModels)
    );
    const fields = fieldReferenceTuples.map(([field, _]) => field);
    const references = fieldReferenceTuples.map(([_, reference]) => reference);
    return {
      ...baseModel,
      fields: baseModel.fields.concat(fields),
      references,
    };
  });
}

function constructReference(
  refDef: ReferenceDef,
  baseModels: BaseModel[]
): [Field, Reference] {
  const model = baseModels.find((m) => m.name === refDef.model)!; // TODO: Throw
  const field: Field = {
    selfRef: `${model.selfRef}.${refDef.name}_id`,
    dbname: `${refDef.name}_id`,
    modelRef: model.selfRef,
    name: `${refDef.name}_id`,
    type: "integer",
    nullable: false,
  };
  const reference: Reference = {
    name: refDef.name,
    fieldRef: field.selfRef,
    targetFieldRef: `${model.selfRef}.id`,
  };
  return [field, reference];
}

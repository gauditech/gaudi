import { Blueprint } from "./types/blueprint";
import * as Parsed from "./types/parsed";
import {
  BaseModel,
  Field,
  Model,
  Reference,
  RefModel,
  Relation,
  RelModel,
} from "./types/model";

export function readDefinition(modelDefs: Parsed.ModelDef[]): Blueprint {
  const models = constructModels(modelDefs);
  const fieldMap = Object.fromEntries(
    models.flatMap((m) => m.fields).map((f) => [f.selfRef, f])
  );
  const modelMap = Object.fromEntries(models.map((m) => [m.selfRef, m]));
  return { models: modelMap, fields: fieldMap };
}

function constructModels(modelDefs: Parsed.ModelDef[]): Model[] {
  // Phase 0: get model definition as param
  // Phase 1: define basic model fields, calculate optionals
  const baseModels = constructBaseModels(modelDefs);
  // Phase 2: build field references
  const refModels = constructRefModels(baseModels);
  const relModels = constructRelModels(refModels);
  return relModels;
}

function constructBaseModels(modelDefs: Parsed.ModelDef[]): BaseModel[] {
  return modelDefs.map((def: Parsed.ModelDef) => {
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
      relationDefs: def.relations ?? [],
    };
  });
}

function constructField(def: Parsed.FieldDef, modelRef: string): Field {
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
      constructReference(refDef, baseModel, baseModels)
    );
    const fields = fieldReferenceTuples.map(([field, _]) => field);
    const references = fieldReferenceTuples.map(([_, reference]) => reference);
    return {
      ...baseModel,
      referenceDefs: undefined,
      fields: baseModel.fields.concat(fields),
      references,
    };
  });
}

function constructReference(
  refDef: Parsed.ReferenceDef,
  parentModel: BaseModel,
  baseModels: BaseModel[]
): [Field, Reference] {
  const targetModel = baseModels.find((m) => m.name === refDef.model)!; // TODO: Throw
  const field: Field = {
    selfRef: `${parentModel.selfRef}.${refDef.name}_id`,
    dbname: `${refDef.name}_id`,
    modelRef: parentModel.selfRef,
    name: `${refDef.name}_id`,
    type: "integer",
    nullable: false,
  };
  const reference: Reference = {
    selfRef: `${parentModel.selfRef}.${refDef.name}`,
    name: refDef.name,
    fieldRef: field.selfRef,
    targetFieldRef: `${targetModel.selfRef}.id`,
  };
  return [field, reference];
}

function constructRelModels(refModels: RefModel[]): RelModel[] {
  return refModels.map((refModel) => ({
    ...refModel,
    relationDefs: undefined,
    relations: refModel.relationDefs.map((def) =>
      constructRelation(def, refModel, refModels)
    ),
  }));
}

function constructRelation(
  def: Parsed.RelationDef,
  parentModel: RefModel,
  models: RefModel[]
): Relation {
  const targetModel = models.find((m) => m.name === def.model)!; // TODO: Throw
  // FIXME Don't assume there's only one reference, reference name should be customizable

  // find a reference pointing to parent model
  const ref = targetModel.references.find(
    (ref) => ref.targetFieldRef === `${parentModel.selfRef}.id`
  )!; // TODO: Throw;
  return {
    name: def.name,
    selfRef: `${parentModel.selfRef}.${def.name}`,
    referenceRef: ref.selfRef,
  };
}

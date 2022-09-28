import e from "express";

import { ensureUnique } from "@src/common/utils";
import { Definition, FieldDef, ModelDef, ReferenceDef, RelationDef } from "@src/types/definition";
import {
  FieldSpec,
  ModelSpec,
  QuerySpec,
  ReferenceSpec,
  RelationSpec,
  Specification,
} from "@src/types/specification";

enum RefType {
  Model = "model",
  Field = "field",
  Reference = "reference",
  Relation = "relation",
  Query = "query",
  Computed = "computed",
}

type Mapping = {
  [RefType.Model]: ModelDef;
  [RefType.Field]: FieldDef;
  [RefType.Reference]: ReferenceDef;
  [RefType.Relation]: RelationDef;
  [RefType.Query]: ModelDef;
  [RefType.Computed]: ModelDef;
};

type Cached<T extends RefType> = [T, Mapping[T]];
const cache = new Map<string, Cached<RefType>>();

export function compose(input: Specification): Definition {
  return {
    models: composeModels(input.models),
  };
}

function composeModels(specs: ModelSpec[]): ModelDef[] {
  let needsExtraStep = true;
  function tryCall<T>(fn: () => T): T | null {
    try {
      return fn();
    } catch (e) {
      if (e === "cache-miss") {
        needsExtraStep = true;
        return null;
      } else {
        throw e;
      }
    }
  }
  let defs: ModelDef[] = [];
  while (needsExtraStep) {
    // FIXME ensure no infinite looping
    needsExtraStep = false;
    // ensure model uniqueness
    ensureUnique(specs.map((s) => s.name.toLowerCase()));
    defs = specs.map((mspec) => {
      // ensure prop uniqueness
      ensureUnique([
        ...mspec.fields.map((f) => f.name.toLowerCase()),
        ...mspec.references.map((r) => r.name.toLowerCase()),
        ...mspec.relations.map((r) => r.name.toLowerCase()),
        ...mspec.queries.map((q) => q.name.toLowerCase()),
        ...mspec.computeds.map((c) => c.name.toLowerCase()),
      ]);
      const mdef = defineModel(mspec);
      mspec.fields.forEach((fspec) => {
        defineField(mdef, fspec);
      });
      mspec.references.forEach((rspec) => {
        tryCall(() => defineReference(mdef, rspec));
      });
      mspec.relations.forEach((rspec) => {
        tryCall(() => defineRelation(mdef, rspec));
      });
      mspec.queries.forEach((qspec) => {
        // tryCall(() => defineQuery(mdef, qspec));
      });

      return mdef;
    });
  }
  return defs;
}

function getDefinition<T extends RefType, F extends true | undefined>(
  refKey: string,
  type: T,
  fail?: F
): F extends true ? Mapping[T] : Mapping[T] | null {
  const definition = cache.get(refKey);
  if (!definition) {
    if (fail) {
      throw "cache-miss";
    } else {
      return null as F extends true ? Mapping[T] : Mapping[T] | null;
    }
  }
  try {
    ensureEqual(type, definition[0]);
  } catch (e) {
    throw new Error(`Expecting type ${type} but found a type ${definition[0]}`);
  }
  return definition[1] as F extends true ? Mapping[T] : Mapping[T] | null;
}

function defineModel(spec: ModelSpec): ModelDef {
  const ex = getDefinition(spec.name, RefType.Model);
  if (ex) return ex;

  const model: ModelDef = {
    dbname: spec.name.toLowerCase(),
    name: spec.name,
    refKey: spec.name,
    fields: [],
    references: [],
    relations: [],
  };
  model.fields.push(constructIdField(model));
  cache.set(model.refKey, [RefType.Model, model]);
  return model;
}

function constructIdField(mdef: ModelDef): FieldDef {
  return {
    refKey: `${mdef.refKey}.id`,
    modelRefKey: mdef.refKey,
    name: "id",
    dbname: "id",
    type: "integer",
    dbtype: "serial",
    primary: true,
    unique: true,
    nullable: false,
  };
}

function defineField(mdef: ModelDef, fspec: FieldSpec): FieldDef {
  const refKey = `${mdef.refKey}.${fspec.name}`;
  const ex = getDefinition(refKey, RefType.Field);
  if (ex) return ex;

  const f: FieldDef = {
    refKey,
    modelRefKey: mdef.refKey,
    name: fspec.name,
    dbname: fspec.name.toLowerCase(),
    type: validateType(fspec.type),
    dbtype: constructDbType(validateType(fspec.type)),
    primary: false,
    unique: !!fspec.unique,
    nullable: !!fspec.nullable,
  };
  cache.set(refKey, [RefType.Field, f]);
  mdef.fields.push(f);
  return f;
}

function defineReference(mdef: ModelDef, rspec: ReferenceSpec): ReferenceDef {
  const refKey = `${mdef.refKey}.${rspec.name}`;
  const ex = getDefinition(refKey, RefType.Reference);
  if (ex) return ex;

  const fieldRefKey = `${refKey}_id`; // or `Id`?? FIXME decide casing logic
  if (getDefinition(refKey, RefType.Field)) {
    throw new Error("Can't make reference field, name taken");
  }
  const f: FieldDef = {
    refKey: fieldRefKey,
    modelRefKey: mdef.refKey,
    name: `${rspec.name}_id`,
    dbname: `${rspec.name}_id`.toLowerCase(),
    type: "integer",
    dbtype: "integer",
    primary: false,
    unique: !!rspec.unique,
    nullable: !!rspec.nullable,
  };
  cache.set(fieldRefKey, [RefType.Field, f]);
  mdef.fields.push(f);

  const ref: ReferenceDef = {
    refKey,
    fieldRefKey,
    modelRefKey: mdef.refKey,
    toModelFieldRefKey: `${rspec.toModel}.id`,
    toModelRefKey: rspec.toModel,
    name: rspec.name,
    unique: !!rspec.unique,
    nullable: !!rspec.nullable,
  };
  cache.set(refKey, [RefType.Reference, ref]);
  mdef.references.push(ref);
  return ref;
}

function defineRelation(mdef: ModelDef, rspec: RelationSpec): RelationDef {
  const refKey = `${mdef.refKey}.${rspec.name}`;
  getDefinition(rspec.fromModel, RefType.Model, true);
  const throughRef = getDefinition(`${rspec.fromModel}.${rspec.through}`, RefType.Reference, true);

  const rel: RelationDef = {
    refKey,
    modelRefKey: mdef.refKey,
    name: rspec.name,
    fromModel: rspec.fromModel,
    fromModelRefKey: rspec.fromModel,
    through: rspec.through,
    throughRefKey: throughRef.refKey,
    nullable: throughRef.nullable,
    unique: throughRef.unique,
  };
  cache.set(refKey, [RefType.Relation, rel]);
  mdef.relations.push(rel);
  return rel;
}

// function defineQuery(mdef: ModelDef, qspec: QuerySpec): void {}

function ensureEqual<T>(a: T, b: T): a is T {
  if (a === b) return true;
  throw new Error("Not equal");
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

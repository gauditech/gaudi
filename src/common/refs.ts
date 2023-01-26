import _, { chain } from "lodash";

import {
  AggregateDef,
  ComputedDef,
  Definition,
  FieldDef,
  ModelDef,
  ModelHookDef,
  QueryDef,
  ReferenceDef,
  RelationDef,
} from "@src/types/definition";

export type RefKind =
  | "model"
  | "field"
  | "reference"
  | "relation"
  | "query"
  | "aggregate"
  | "computed"
  | "model-hook";

export type Ref<T extends RefKind> = T extends "model"
  ? ModelDef
  : T extends "field"
  ? FieldDef
  : T extends "reference"
  ? ReferenceDef
  : T extends "relation"
  ? RelationDef
  : T extends "query"
  ? QueryDef
  : T extends "aggregate"
  ? AggregateDef
  : T extends "computed"
  ? ComputedDef
  : T extends "model-hook"
  ? ModelHookDef
  : never;

export class UnknownRefKeyError extends Error {
  refKey: string;
  constructor(refKey: string) {
    super(`Unknown refkey: ${refKey}`);
    this.refKey = refKey;
  }
}

function getAnyRef(
  def: Pick<Definition, "models">,
  modelNameOrRefKey: string,
  relName?: string
): Ref<RefKind> {
  const refKey = relName ? `${modelNameOrRefKey}.${relName}` : modelNameOrRefKey;
  const model = def.models.find((m) => m.refKey === refKey);
  if (model) return model;

  const modelProps = [
    "fields",
    "references",
    "relations",
    "queries",
    "aggregates",
    "computeds",
    "hooks",
  ] as const;

  for (const prop of modelProps) {
    const ref = def.models
      .flatMap((m): Ref<Exclude<RefKind, "model">>[] => m[prop])
      .find((v) => v.refKey === refKey);
    if (ref) return ref;
  }

  // nothing found
  throw new UnknownRefKeyError(refKey);
}

export function getRef<T extends RefKind>(
  def: Definition,
  modelNameOrRefKey: string,
  relName?: string,
  kinds: T | T[] = [
    "model",
    "reference",
    "relation",
    "query",
    "aggregate",
    "field",
    "computed",
    "model-hook",
  ] as T[]
): Ref<T> {
  const ref = getAnyRef(def, modelNameOrRefKey, relName);
  kinds = _.castArray(kinds);
  if (kinds.find((k) => k === ref.kind)) {
    return ref as Ref<T>;
  } else {
    throw new Error(`Expected one of: [${kinds.join(", ")}], got ${ref.kind}`);
  }
}

getRef.except = function getRefExcept<T extends RefKind>(
  def: Definition,
  modelNameOrRefKey: string,
  relName?: string,
  except: T | T[] = [] as T[]
): Ref<Exclude<RefKind, T>> {
  const ref = getAnyRef(def, modelNameOrRefKey, relName);
  except = _.castArray(except);
  if (ref.kind in except) {
    throw new Error(`Ref ${ref.kind} not allowed`);
  }
  return ref as never;
};

getRef.model = function getRefModel(def: Definition, modelName: string): ModelDef {
  return getRef(def, modelName, undefined, ["model"]);
};

getRef.field = function getRefField(
  def: Definition,
  modelName: string,
  fieldName?: string
): FieldDef {
  return getRef(def, modelName, fieldName, ["field"]);
};

getRef.reference = function getRefReference(
  def: Definition,
  modelName: string,
  queryName?: string
): ReferenceDef {
  return getRef(def, modelName, queryName, ["reference"]);
};

getRef.relation = function getRefRelation(
  def: Definition,
  modelName: string,
  queryName?: string
): RelationDef {
  return getRef(def, modelName, queryName, ["relation"]);
};

getRef.query = function getRefQuery(
  def: Definition,
  modelName: string,
  queryName?: string
): QueryDef {
  return getRef(def, modelName, queryName, ["query"]);
};

getRef.aggregate = function getRefAggregate(
  def: Definition,
  modelName: string,
  aggrName?: string
): AggregateDef {
  return getRef(def, modelName, aggrName, ["aggregate"]);
};

getRef.computed = function getRefComputed(
  def: Definition,
  modelName: string,
  computedName?: string
): ComputedDef {
  return getRef(def, modelName, computedName, ["computed"]);
};

getRef.modelHook = function getRefModelHook(
  def: Definition,
  modelName: string,
  hookName?: string
): ModelHookDef {
  return getRef(def, modelName, hookName, ["model-hook"]);
};

export function getTargetModel(def: Definition, refKey: string): ModelDef {
  const prop = getRef(def, refKey);
  switch (prop.kind) {
    case "model": {
      return prop;
    }
    case "reference": {
      return getRef.model(def, prop.toModelRefKey);
    }
    case "relation": {
      return getRef.model(def, prop.fromModelRefKey);
    }
    case "query": {
      return getRef.model(def, prop.retType);
    }
    case "aggregate": {
      return getRef.model(def, prop.query.retType);
    }
    default:
      throw new Error(`Kind ${prop.kind} not supported`);
  }
}

/**
 * This functions maps feild types to target (Prisma) field types
 *
 * https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference#model-field-scalar-types
 */
export function getFieldDbType(type: FieldDef["dbtype"]): string {
  switch (type) {
    case "serial":
      return "Int";
    case "integer":
      return "Int";
    case "text":
      return "String";
    case "boolean":
      return "Boolean";
  }
}

/** Map data record's model field names to dbnames */
export function dataToFieldDbnames(
  model: ModelDef,
  data: Record<string, unknown>
): Record<string, unknown> {
  return chain(data)
    .toPairs()
    .map(([name, value]) => [nameToFieldDbname(model, name), value])
    .fromPairs()
    .value();
}

function nameToFieldDbname(model: ModelDef, name: string): string {
  const field = model.fields.find((f) => f.name === name);
  if (!field) {
    throw new Error(`Field ${model.name}.${name} doesn't exist`);
  }
  return field.dbname;
}

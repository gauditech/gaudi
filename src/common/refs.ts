import { chain } from "lodash";

import {
  ComputedDef,
  Definition,
  FieldDef,
  ModelDef,
  ModelHookDef,
  QueryDef,
  ReferenceDef,
  RelationDef,
} from "@src/types/definition";

export type RefKind = "model" | "field" | "reference" | "relation" | "query" | "computed" | "hook";
export type Ref<T extends RefKind> = T extends "model"
  ? { kind: "model"; value: ModelDef }
  : T extends "field"
  ? { kind: "field"; value: FieldDef }
  : T extends "reference"
  ? { kind: "reference"; value: ReferenceDef }
  : T extends "relation"
  ? { kind: "relation"; value: RelationDef }
  : T extends "query"
  ? { kind: "query"; value: QueryDef }
  : T extends "computed"
  ? { kind: "computed"; value: ComputedDef }
  : T extends "hook"
  ? { kind: "hook"; value: ModelHookDef }
  : never;

export function getRef<T extends RefKind>(source: Definition | ModelDef[], refKey: string): Ref<T> {
  if ("models" in source) {
    return getRef<T>(source.models, refKey);
  }
  const model = source.find((m) => m.refKey === refKey);
  if (model) return { kind: "model", value: model } as Ref<T>;

  const field = source.flatMap((m) => m.fields).find((f) => f.refKey === refKey);
  if (field) return { kind: "field", value: field } as Ref<T>;

  const reference = source.flatMap((m) => m.references).find((r) => r.refKey === refKey);
  if (reference) return { kind: "reference", value: reference } as Ref<T>;

  const relation = source.flatMap((m) => m.relations).find((r) => r.refKey === refKey);
  if (relation) return { kind: "relation", value: relation } as Ref<T>;

  const query = source.flatMap((m) => m.queries).find((q) => q.refKey === refKey);
  if (query) return { kind: "query", value: query } as Ref<T>;

  const computed = source.flatMap((m) => m.computeds).find((q) => q.refKey === refKey);
  if (computed) return { kind: "computed", value: computed } as Ref<T>;

  const hook = source.flatMap((m) => m.hooks).find((q) => q.refKey === refKey);
  if (hook) return { kind: "hook", value: hook } as Ref<T>;

  throw ["unknown-refkey", refKey];
}

export function getRef2<T extends RefKind>(
  def: Definition,
  modelName: string,
  relName?: string,
  kinds: T[] = ["model", "reference", "relation", "query", "field", "computed"] as T[]
): Ref<T> {
  const ref = getRef<typeof kinds[number]>(def, relName ? `${modelName}.${relName}` : modelName);
  if (kinds.indexOf(ref.kind as T) < 0) {
    if (kinds.length === 1) {
      // slightly better error message if a single specific kind was requested
      throw new Error(`Expected ${kinds[0]}, got ${ref.kind}`);
    } else {
      throw new Error(`Expected one of: [${kinds.join(", ")}], got ${ref.kind}`);
    }
  }
  return ref;
}

getRef2.model = function getRefModel(def: Definition, modelName: string): ModelDef {
  return getRef2(def, modelName, undefined, ["model"]).value;
};

getRef2.field = function getRefField(
  def: Definition,
  modelName: string,
  fieldName?: string
): FieldDef {
  return getRef2(def, modelName, fieldName, ["field"]).value;
};

getRef2.computed = function getRefField(
  def: Definition,
  modelName: string,
  computedName?: string
): ComputedDef {
  return getRef2(def, modelName, computedName, ["computed"]).value;
};

export function getModelProp<T extends RefKind>(model: ModelDef, name: string) {
  return getRef<T>([model], `${model.name}.${name}`);
}

// FIXME first arg should be Definition, not ModelDef[]
export function getTargetModel(models: ModelDef[], refKey: string): ModelDef {
  const prop = getRef(models, refKey);
  switch (prop.kind) {
    case "reference": {
      return getRef<"model">(models, prop.value.toModelRefKey).value;
    }
    case "relation": {
      return getRef<"model">(models, prop.value.fromModelRefKey).value;
    }
    case "query": {
      return getRef<"model">(models, prop.value.retType).value;
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

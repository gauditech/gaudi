import { chain } from "lodash";

import {
  Definition,
  FieldDef,
  ModelHookDef,
  ModelDef,
  QueryDef,
  ReferenceDef,
  RelationDef,
} from "@src/types/definition";

export type RefKind = "model" | "field" | "reference" | "relation" | "query" | "hook";
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

  const hook = source.flatMap((m) => m.hooks).find((q) => q.refKey === refKey);
  if (hook) return { kind: "hook", value: hook } as Ref<T>;

  throw ["unknown-refkey", refKey];
}

export function getModelProp<T extends RefKind>(model: ModelDef, name: string) {
  return getRef<T>([model], `${model.name}.${name}`);
}

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

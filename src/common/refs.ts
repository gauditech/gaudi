import _, { chain } from "lodash";
import { match } from "ts-pattern";

import { UnreachableError, ensureEqual } from "./utils";

import { VarContext, getTypedPath } from "@src/composer/utils";
import {
  AggregateDef,
  ComputedDef,
  Definition,
  ExecutionRuntimeDef,
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

export function getResultModel(def: Definition, path: string[], ctx: VarContext): ModelDef {
  const tpath = getTypedPath(def, path, ctx);
  ensureEqual(tpath.leaf, null);
  if (tpath.nodes.length) {
    const refKey = _.last(tpath.nodes)!.refKey;
    return getTargetModel(def, refKey);
  } else {
    if (tpath.source.kind === "model") {
      return getRef.model(def, tpath.source.refKey);
    } else {
      return getRef.model(def, tpath.source.model.refKey);
    }
  }
}

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

export function getExecutionRuntime(def: Definition, name: string): ExecutionRuntimeDef {
  const runtime = def.runtimes.find((r) => r.name === name);
  if (runtime == null) throw new Error(`Execution runtime not found ${name}`);

  return runtime;
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
    .map(([name, value]) => [fieldModelToDbName(model, name), value])
    .fromPairs()
    .value();
}

/** Map data record's DB field names to model names */
export function dataToFieldModelNames(
  model: ModelDef,
  data: Record<string, unknown>
): Record<string, unknown> {
  return chain(data)
    .toPairs()
    .map(([name, value]) => [fieldDbToModelName(model, name), value])
    .fromPairs()
    .value();
}

/** Map model field name to it's DB name */
export function fieldModelToDbName(model: ModelDef, name: string): string {
  const field = model.fields.find((f) => f.name === name);
  if (!field) {
    throw new Error(`Field ${model.name}.${name} doesn't exist`);
  }
  return field.dbname;
}

/** Map model field name to it's DB name */
export function fieldDbToModelName(model: ModelDef, dbname: string): string {
  const field = model.fields.find((f) => f.dbname === dbname);
  if (!field) {
    throw new Error(`Field ${model.name}.${dbname} doesn't exist`);
  }
  return field.name;
}

export function getSourceRef(def: Definition, sourcePath: string[]) {
  const tpath = getTypedPath(def, sourcePath, {});
  if (tpath.nodes.length) {
    return getRef(def, _.last(tpath.nodes)!.refKey);
  } else {
    return match(tpath.source)
      .with({ kind: "model" }, (source) => getRef(def, source.refKey))
      .otherwise(() => {
        throw new UnreachableError("Doesn't support paths from the context");
      });
  }
}

import _ from "lodash";

import { getRef, getTargetModel } from "@src/common/refs";
import { LiteralValue } from "@src/types/ast";
import { Definition, LiteralFilterDef, ModelDef } from "@src/types/definition";

export function getTypedLiteralValue(literal: LiteralValue): LiteralFilterDef {
  if (typeof literal === "string") {
    return { type: "text", value: literal, kind: "literal" };
  }
  if (typeof literal === "number" && Number.isSafeInteger(literal)) {
    return { kind: "literal", type: "integer", value: literal };
  }
  if (typeof literal === "boolean") {
    return { kind: "literal", type: "boolean", value: literal };
  }
  if (literal === null) {
    return { kind: "literal", type: "null", value: literal };
  }
  throw new Error(`Literal ${literal} not supported`);
}

export type TypedPathItemModel = { kind: "model"; name: string; refKey: string };
export type TypedPathItemField = { kind: "field"; name: string; refKey: string };
export type TypedPathItemReference = { kind: "reference"; name: string; refKey: string };
export type TypedPathItemRelation = { kind: "relation"; name: string; refKey: string };
export type TypedPathItemQuery = { kind: "query"; name: string; refKey: string };
type TypedPathItemContext = { kind: "context"; model: TypedPathItemModel; name: string };

export type TypedPathItem =
  | TypedPathItemContext
  | TypedPathItemReference
  | TypedPathItemRelation
  | TypedPathItemQuery
  | TypedPathItemField
  | TypedPathItemModel;

/*
 * FIXME Consider `nullable`, `cardinality` and `retType` properties to every element,
 *       and to the structure root as well.
 * FIXME Consider adding `namePath` for ease of access when passing the data around.
 *       That property would also be useful for `getTypedPathFromContextEnding` which
 *       modifies the input path.
 */
export type TypedPath = {
  source: TypedPathItemModel | TypedPathItemContext;
  nodes: (TypedPathItemReference | TypedPathItemRelation | TypedPathItemQuery)[];
  leaf: TypedPathItemField | null;
};

function getTypedPath(def: Definition, path: string[]): TypedPathItem[] {
  // assume it starts with model
  const { value: model } = getRef<"model">(def, path[0]);
  const modelIdDef: TypedPathItem = { kind: "model", name: model.name, refKey: model.refKey };

  const ret = _.tail(path).reduce(
    (acc, name) => {
      if (acc.ctx === null) {
        throw new Error(`Cannot compose paths outside of Model context`);
      }
      // what is this?
      const refKey = `${acc.ctx.refKey}.${name}`;
      const ref = getRef<"field" | "reference" | "relation" | "query">(def, refKey);
      let targetCtx: ModelDef | null;
      if (ref.kind === "field") {
        targetCtx = null;
      } else {
        targetCtx = getTargetModel(def.models, refKey);
      }
      const idDef: TypedPathItem = { kind: ref.kind, name, refKey };
      return { path: [...acc.path, idDef], ctx: targetCtx };
    },
    { path: [modelIdDef], ctx: model } as { path: TypedPathItem[]; ctx: ModelDef | null }
  );
  return ret.path;
}

export type VarContext = Record<string, ContextRecord>;
type ContextRecord = { modelName: string };

export function getTypedPathFromContext(
  def: Definition,
  ctx: VarContext,
  path: string[]
): TypedPath {
  if (_.isEmpty(path)) {
    throw new Error("Path is empty");
  }
  const [start, ...rest] = path;
  const isCtx = start in ctx;

  let startModel: string;

  if (isCtx) {
    startModel = ctx[start].modelName;
  } else {
    startModel = getRef<"model">(def, start).value.name;
  }
  const tpath = getTypedPath(def, [startModel, ...rest]);

  let source: TypedPathItemContext | TypedPathItemModel;
  if (isCtx) {
    source = {
      kind: "context",
      model: tpath[0] as TypedPathItemModel,
      name: start,
    };
  } else {
    source = tpath[0] as TypedPathItemModel;
  }
  if (_.last(tpath)!.kind === "field") {
    return {
      source,
      nodes: _.initial(_.tail(tpath)) as TypedPath["nodes"],
      leaf: _.last(tpath) as TypedPathItemField,
    };
  } else {
    return { source, nodes: _.tail(tpath) as TypedPath["nodes"], leaf: null };
  }
}
/**
 * `TypedContextPath` where `leaf` is not nullable.
 */
interface TypedContextPathWithLeaf extends TypedPath {
  leaf: TypedPathItemField;
}
/**
 * Constructs typed path from context (`getTypedPathFromContext`), but
 * ensures that path ends with a `leaf`. If original path doesn't end
 * with a `leaf`, this function appends `id` field at the end.
 */
export function getTypedPathFromContextWithLeaf(
  def: Definition,
  ctx: VarContext,
  path: string[]
): TypedContextPathWithLeaf {
  const tpath = getTypedPathFromContext(def, ctx, path);
  if (tpath.leaf) {
    return tpath as TypedContextPathWithLeaf;
  } else {
    return getTypedPathFromContext(def, ctx, [...path, "id"]) as TypedContextPathWithLeaf;
  }
}

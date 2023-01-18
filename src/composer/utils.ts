import _ from "lodash";

import { getRef, getTargetModel } from "@src/common/refs";
import { LiteralValue } from "@src/types/ast";
import { Definition, LiteralValueDef, ModelDef } from "@src/types/definition";

export function getTypedLiteralValue(literal: LiteralValue): LiteralValueDef {
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
export type TypedPathItemAggregate = { kind: "aggregate"; name: string; refKey: string };
export type TypedPathItemComputed = { kind: "computed"; name: string; refKey: string };
export type TypedPathItemContext = { kind: "context"; model: TypedPathItemModel; name: string };

export type TypedPathItem =
  | TypedPathItemContext
  | TypedPathItemReference
  | TypedPathItemRelation
  | TypedPathItemQuery
  | TypedPathItemAggregate
  | TypedPathItemField
  | TypedPathItemComputed
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
  // Hooks are not a valid leaf yet. If you need to be able to resolve hook-ending paths,
  // eg. when passing args to other hooks, we need to make sure the other places
  // can't do that: filters, computeds...
  leaf: TypedPathItemField | TypedPathItemComputed | TypedPathItemAggregate | null;
};

export type VarContext = Record<string, ContextRecord>;
type ContextRecord = { modelName: string };

export function getTypedPath(def: Definition, path: string[], ctx: VarContext): TypedPath {
  if (_.isEmpty(path)) {
    throw new Error("Path is empty");
  }
  const start = _.first(path)!;
  const isCtx = start in ctx;
  const startModel = getRef.model(def, isCtx ? ctx[start].modelName : start);

  let source: TypedPathItemContext | TypedPathItemModel;
  if (isCtx) {
    source = {
      kind: "context",
      model: { kind: "model", name: startModel.name, refKey: startModel.refKey },
      name: start,
    };
  } else {
    source = { kind: "model", name: startModel.name, refKey: startModel.refKey };
  }

  const ret = _.tail(path).reduce(
    (acc, name) => {
      if (acc.ctx === null) {
        throw new Error(`Cannot compose paths outside of Model context`);
      }
      // what is this?
      const refKey = `${acc.ctx.refKey}.${name}`;
      const ref = getRef(def, acc.ctx.refKey, name, [
        "field",
        "reference",
        "relation",
        "query",
        "aggregate",
        "computed",
      ]);
      let targetCtx: ModelDef | null;
      if (ref.kind === "field" || ref.kind === "computed" || ref.kind === "aggregate") {
        targetCtx = null;
      } else {
        targetCtx = getTargetModel(def, refKey);
      }
      const idDef: TypedPathItem = { kind: ref.kind, name, refKey };
      return { path: [...acc.path, idDef], ctx: targetCtx };
    },
    { path: [], ctx: startModel } as { path: TypedPathItem[]; ctx: ModelDef | null }
  );
  const tpath = ret.path;
  const last = _.last(tpath);

  if (last?.kind === "field" || last?.kind === "computed" || last?.kind === "aggregate") {
    return {
      source,
      nodes: _.initial(tpath) as TypedPath["nodes"],
      leaf: _.last(tpath) as TypedPathItemField,
    };
  } else {
    return { source, nodes: tpath as TypedPath["nodes"], leaf: null };
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
export function getTypedPathWithLeaf(
  def: Definition,
  path: string[],
  ctx: VarContext
): TypedContextPathWithLeaf {
  const tpath = getTypedPath(def, path, ctx);
  if (tpath.leaf) {
    return tpath as TypedContextPathWithLeaf;
  } else {
    return getTypedPath(def, [...path, "id"], ctx) as TypedContextPathWithLeaf;
  }
}

import _ from "lodash";

import { getRef, getTargetModel } from "@src/common/refs";
import { LiteralValue } from "@src/types/ast";
import { Definition, IdentifierDef, LiteralFilterDef, ModelDef } from "@src/types/definition";

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

export function getPathRetType(def: Definition, path: string[]): ModelDef {
  // assume it starts with model
  const { value: model } = getRef<"model">(def, path[0]);
  const ret = _.tail(path).reduce(
    (ctx, name) => getTargetModel(def.models, `${ctx.refKey}.${name}`),
    model
  );
  return ret;
}

export function getTypedPath(def: Definition, path: string[]): IdentifierDef[] {
  // assume it starts with model
  const { value: model } = getRef<"model">(def, path[0]);
  const modelIdDef: IdentifierDef = { kind: "model", name: model.name, refKey: model.refKey };

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
      const idDef: IdentifierDef = { kind: ref.kind, name, refKey };
      return { path: [...acc.path, idDef], ctx: targetCtx };
    },
    { path: [modelIdDef], ctx: model } as { path: IdentifierDef[]; ctx: ModelDef | null }
  );
  return ret.path;
}

export function getPrimitiveTypedPath(def: Definition, path: string[]): IdentifierDef[] {
  const typedPath = getTypedPath(def, path);
  const leaf = _.last(typedPath);
  switch (leaf?.kind) {
    case "field": {
      return typedPath;
    }
    case "model":
    case "query":
    case "reference":
    case "relation": {
      return getTypedPath(def, [...path, "id"]);
    }
    case undefined: {
      throw new Error("Path is empty!");
    }
  }
}

import _ from "lodash";

import { getRef, getTargetModel } from "@src/common/refs";
import { LiteralValue } from "@src/types/ast";
import { Definition, IdentifierDef, LiteralFilterDef, ModelDef } from "@src/types/definition";

export function getTypedLiteralValue(literal: LiteralValue): LiteralFilterDef["type"] {
  if (typeof literal === "string") return "text";
  if (typeof literal === "number" && Number.isSafeInteger(literal)) return "integer";
  if (typeof literal === "boolean") return "boolean";
  if (literal === null) return "null";
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
  const modelIdDef: IdentifierDef = { kind: "model", refKey: model.refKey };

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
      const idDef: IdentifierDef = { kind: ref.kind, refKey };
      return { path: [...acc.path, idDef], ctx: targetCtx };
    },
    { path: [modelIdDef], ctx: model } as { path: IdentifierDef[]; ctx: ModelDef | null }
  );
  return ret.path;
}

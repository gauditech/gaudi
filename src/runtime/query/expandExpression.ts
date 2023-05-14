import _ from "lodash";

import { transformExpressionPaths } from "./build";

import { getRef } from "@src/common/refs";
import { assertUnreachable, ensureNot } from "@src/common/utils";
import { getTypedPath } from "@src/composer/utils";
import { Definition, TypedExprDef } from "@src/types/definition";

/**
 * Expands computeds in the expression to build an expression consisting only
 * of fields.
 */
export function expandExpression(def: Definition, exp: TypedExprDef): TypedExprDef {
  if (exp === undefined) {
    return undefined;
  }
  switch (exp.kind) {
    case "literal":
    case "variable":
      return exp;
    case "alias": {
      const tpath = getTypedPath(def, exp.namePath, {});
      ensureNot(tpath.leaf, null);
      switch (tpath.leaf.kind) {
        case "aggregate":
        case "field": {
          return exp;
        }
        case "computed": {
          const computed = getRef.computed(def, tpath.leaf.refKey);
          const newExp = expandExpression(def, computed.exp);
          return transformExpressionPaths(newExp, [computed.modelRefKey], _.initial(exp.namePath));
        }
        default: {
          return assertUnreachable(tpath.leaf);
        }
      }
    }
    case "function": {
      switch (exp.name) {
        case "count":
        case "sum": {
          return exp;
        }
        default:
          return {
            ...exp,
            args: exp.args.map((arg) => expandExpression(def, arg)),
          };
      }
    }
    default: {
      assertUnreachable(exp);
    }
  }
}

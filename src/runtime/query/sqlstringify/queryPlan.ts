import _ from "lodash";

import { getRef } from "@src/common/refs";
import { UnreachableError, assertUnreachable, ensureEqual, ensureNot } from "@src/common/utils";
import { VarContext, getTypedPath } from "@src/composer/utils";
import { Definition, FunctionName, QueryDef, TypedExprDef } from "@src/types/definition";

export type ShallowDep = {
  path: string[];
  aggregate: "sum" | "count" | null;
};
export type ShallowDeps = ShallowDep[];

/**
 * I don't know what this is yet!
 */

type NamePath = string[];

export type QueryPlan = {
  entry: string;
  // namePath: NamePath;
  joins: QueryPlanJoin[];
  groupBy: NamePath[];
  filter?: QueryPlanExpression;
  select?: Record<string, QueryPlanExpression>; // key is 'alias'
  orderBy?: [NamePath, "asc" | "desc"][];
  limit?: number;
  offset?: number;
};

export type JoinWithSubquery = {
  kind: "subquery";
  joinType: "inner" | "left";
  plan: QueryPlan;
  joins: QueryPlanJoin[];
};

export type InlineJoin = {
  kind: "inline";
  joinType: "inner" | "left";
  target: string;
  joins: QueryPlanJoin[];
};

export type QueryPlanJoin = JoinWithSubquery | InlineJoin;

export type QueryPlanExpression =
  | {
      kind: "literal";
      type: "boolean" | "null" | "text" | "integer";
      value: unknown;
    }
  | {
      kind: "alias";
      value: NamePath;
    }
  | { kind: "function"; fnName: FunctionName; args: QueryPlanExpression[] }
  | { kind: "variable"; name: string };

export function collectShalowDeps(q: QueryDef): ShallowDeps {
  // collect select
  const selectDeps = q.select.map((s): ShallowDep => {
    switch (s.kind) {
      case "computed":
      case "field": {
        return { path: s.namePath, aggregate: null };
      }
      default: {
        throw new UnreachableError(`"${s.kind}" is not a valid selectable item!`);
      }
    }
  });

  const filterDeps = expressionToShallowDeps(q.filter);

  const allDeps = [...selectDeps, ...filterDeps];
  return _.uniqBy(allDeps, (d) => `${d.aggregate}|${d.path.join(".")}`);
}

function expressionToShallowDeps(exp: TypedExprDef): ShallowDeps {
  switch (exp?.kind) {
    case undefined:
    case "variable":
    case "literal": {
      return [];
    }
    case "alias": {
      return [{ path: exp.namePath, aggregate: null }];
    }
    case "function": {
      switch (exp.name) {
        case "count":
        case "sum": {
          const target = expressionToShallowDeps(exp.args[0]);
          ensureEqual(target.length, 1);
          return [{ path: target[0].path, aggregate: exp.name }];
        }
        default: {
          // it's an actual function
          return exp.args.flatMap(_.unary(expressionToShallowDeps));
        }
      }
    }
    default: {
      return assertUnreachable(exp);
    }
  }
}

function expressionToExpandedDeps(
  def: Definition,
  exp: TypedExprDef,
  ctx: VarContext,
  shallow = false
): ShallowDeps {
  switch (exp?.kind) {
    case undefined:
    case "variable":
    case "literal": {
      return [];
    }
    case "alias": {
      const tpath = getTypedPath(def, exp.namePath, ctx);
      ensureNot(tpath.leaf, null);
      const ref = getRef(def, tpath.leaf?.refKey);
      switch (ref.kind) {
        case "field": {
          return [{ path: exp.namePath, aggregate: null }];
        }
        case "computed": {
          if (shallow) {
            return [{ path: exp.namePath, aggregate: null }];
          }
          return expressionToExpandedDeps(def, ref.exp, ctx);
        }
        default: {
          throw new UnreachableError(`${ref.kind} is not allowed query atom`);
        }
      }
    }
    case "function": {
      switch (exp.name) {
        case "count":
        case "sum": {
          const target = expressionToShallowDeps(exp.args[0]);
          ensureEqual(target.length, 1);
          return [{ path: target[0].path, aggregate: exp.name }];
        }
        default: {
          return exp.args.flatMap(_.unary(expressionToShallowDeps));
        }
      }
    }
  }
}

// export function buildQueryPlan(q: QueryDef): QueryPlan {
//   const atoms = collectShalowDeps(q);
//   const expandedAtoms = collectExpandedDeps(q);
// }

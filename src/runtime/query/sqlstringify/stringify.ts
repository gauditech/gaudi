import _ from "lodash";

import { NamePath } from "../build";

import { QueryPlan, QueryPlanExpression, QueryPlanJoin } from "./queryPlan";

import { assertUnreachable } from "@src/common/utils";

function namepathToQuotedPair(npath: NamePath): string {
  return `"${_.initial(npath).join(".")}"."${_.last(npath)}"`;
}

function namepathToQuoted(npath: NamePath): string {
  return `"${npath.join(".")}"`;
}

function exprToString(expr: QueryPlanExpression): string {
  function stringifyOp(lhs: QueryPlanExpression, rhs: QueryPlanExpression, op: string): string {
    return `${exprToString(lhs)} ${op.toUpperCase()} ${exprToString(rhs)}`;
  }
  function stringifyFn(name: string, args: QueryPlanExpression[]): string {
    return `${name}(${args.map(_.unary(exprToString)).join(", ")})`;
  }
  switch (expr.kind) {
    case "alias": {
      return namepathToQuotedPair(expr.value);
    }
    case "literal": {
      return expr.value as string; // FIXME
    }
    case "variable": {
      return `:${expr.name}`;
    }
    case "function": {
      switch (expr.fnName) {
        case "<":
        case ">":
        case ">=":
        case "<=":
        case "/":
        case "*":
        case "in":
        case "not in":
        case "and": {
          return stringifyOp(expr.args[0], expr.args[1], expr.fnName);
        }
        case "+":
        case "-":
        case "or": {
          return `(${stringifyOp(expr.args[0], expr.args[1], expr.fnName)})`;
        }
        case "is": {
          return stringifyOp(expr.args[0], expr.args[1], "=");
        }
        case "is not": {
          return stringifyOp(expr.args[0], expr.args[1], "<>");
        }
        case "length": {
          return stringifyFn("char_length", expr.args);
        }
        case "count":
        case "sum":
        case "lower":
        case "upper":
        case "now":
        case "concat": {
          return stringifyFn(expr.fnName, expr.args);
        }
        case "stringify":
        case "cryptoCompare":
        case "cryptoHash":
        case "cryptoToken":
          throw new Error(`Expression "${expr.fnName}" cannot be used in queries.`);
        default:
          return assertUnreachable(expr.fnName);
      }
    }
  }
}

function joinsToString(joins: QueryPlanJoin[]): string {
  return joins
    .map((join) => {
      switch (join.kind) {
        case "subquery": {
          const subquery = queryPlanToString(join.plan);
          return `
    JOIN (${subquery})
    AS ${namepathToQuoted(join.namePath)}
    ON ${namepathToQuotedPair(join.joinOn[0])} = ${namepathToQuotedPair(join.joinOn[1])}
    ${joinsToString(join.plan.joins)}`;
        }
        case "inline": {
          return `
    JOIN ${join.modelName.toLowerCase()} AS ${namepathToQuoted(join.namePath)}
    ON ${namepathToQuotedPair(join.joinOn[0])} = ${namepathToQuotedPair(join.joinOn[1])}
    ${joinsToString(join.joins)}
    `;
        }
      }
    })
    .join("\n");
}

export function queryPlanToString(plan: QueryPlan): string {
  const selectFrag = plan.select
    ? Object.entries(plan.select)
        .map(([alias, expr]) => `${exprToString(expr)} AS "${alias}"`)
        .join(", ")
    : "*";
  const limitFrag = plan.limit ? `LIMIT ${plan.limit}` : "";
  const orderFrag = plan.orderBy
    ? `ORDER BY ${plan.orderBy.map(
        ([path, dir]): string => `${namepathToQuotedPair(path)} ${dir}`
      )}`
    : "";
  const offsetFrag = plan.offset ? `OFFSET ${plan.offset}` : "";

  const joinFrags = joinsToString(plan.joins);
  const whereFrag = plan.filter ? `WHERE ${exprToString(plan.filter)}` : "";

  const groupByItems = plan.groupBy.map(_.unary(namepathToQuotedPair));
  const groupByFrag = groupByItems.length > 0 ? `GROUP BY ${groupByItems}` : "";

  return `
  SELECT ${selectFrag}
  FROM ${plan.entry.toLowerCase()} AS "${plan.entry}"
  ${joinFrags}
  ${whereFrag}
  ${groupByFrag}
  ${orderFrag}
  ${limitFrag}
  ${offsetFrag} 
  `;
}

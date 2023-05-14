import _ from "lodash";

import { QueryPlanExpression, QueryPlan, QueryPlanJoin, QueryPlanSelectMap } from "./queryPlan";

import { FilteredByKind } from "@src/common/kindFilter";
import { assertUnreachable } from "@src/common/utils";

export function queryPlanToSQL(plan: QueryPlan): string {
  const where = plan.filter ? `WHERE ${expressionToString(plan.filter)}` : "";
  const joins = plan.joins.map(_.unary(joinToSQL)).join("");
  return `
  SELECT ${selectToString(plan.select)}
  FROM "${plan.sourceModel}" AS "${plan.sourceModel}"
  ${where}`;
  // FIXME apply limit and order!
}

export function selectToString(select: QueryPlanSelectMap): string {
  return Object.entries(select)
    .map(([alias, [table, field]]) => `"${table}"."${field}" AS "${alias}"`)
    .join(", ");
}
export function expressionToString(exp: QueryPlanExpression): string {
  if (exp === undefined) return "TRUE = TRUE";
  switch (exp.kind) {
    case "literal": {
      switch (exp.type) {
        case "boolean":
          return exp.value ? "TRUE" : "FALSE";
        case "null":
          return "NULL";
        case "text":
          return `'${exp.value}'`;
        case "integer":
          return (exp.value as number).toString();
        default:
          return assertUnreachable(exp.type);
      }
    }
    case "alias": {
      return `"${exp.value[0]}"."${exp.value[1]}"`;
    }
    case "function": {
      return functionToString(exp);
    }
    case "variable": {
      // Start variable names with a `:` which is a knex format for query variables
      // Knex does interpolation on variables, taking care of SQL injection etc.
      return `:${exp.name}`;
    }
  }
}
function functionToString(exp: FilteredByKind<QueryPlanExpression, "function">): string {
  function stringifyOp(lhs: QueryPlanExpression, rhs: QueryPlanExpression, op: string): string {
    return `${expressionToString(lhs)} ${op.toUpperCase()} ${expressionToString(rhs)}`;
  }
  function stringifyFn(name: string, args: QueryPlanExpression[]): string {
    return `${name}(${args.map((a) => expressionToString(a)).join(", ")})`;
  }
  switch (exp.fnName) {
    case "<":
    case ">":
    case ">=":
    case "<=":
    case "/":
    case "*":
    case "in":
    case "not in":
    case "and": {
      return stringifyOp(exp.args[0], exp.args[1], exp.fnName);
    }
    case "+":
    case "-":
    case "or": {
      return `(${stringifyOp(exp.args[0], exp.args[1], exp.fnName)})`;
    }
    case "is": {
      return stringifyOp(exp.args[0], exp.args[1], "=");
    }
    case "is not": {
      return stringifyOp(exp.args[0], exp.args[1], "<>");
    }
    case "length": {
      return stringifyFn("char_length", exp.args);
    }
    case "concat": {
      return stringifyFn("concat", exp.args);
    }
    case "lower": {
      return stringifyFn("lower", exp.args);
    }
    case "upper": {
      return stringifyFn("upper", exp.args);
    }
    case "now": {
      return stringifyFn("now", exp.args);
    }
    case "stringify":
    case "cryptoCompare":
    case "cryptoHash":
    case "cryptoToken":
      throw new Error(`Expression "${exp.fnName}" cannot be used in queries.`);
    default:
      return assertUnreachable(exp.fnName);
  }
}
export function joinToSQL(join: QueryPlanJoin): string {
  switch (join.kind) {
    case "aggregate": {
      return joinAggregateToSQL(join);
    }
    case "relation": {
      return "TODO";
    }
    default: {
      return assertUnreachable(join);
    }
  }
}
function joinAggregateToSQL(join: FilteredByKind<QueryPlanJoin, "aggregate">): string {
  const namespaceAlias = join.namespace.join(".");
  const tableAlias = [...join.namespace, ...join.target].join(".");

  // FIXME `a.target` can be a computed expression
  const select = join.aggregates.map((a) => `${a.name}(${a.target}) AS "${a.alias}"`);

  const on = `${tableAlias}."__join_connection" == ${namespaceAlias}."id"`;

  return `
  JOIN
  (
    SELECT "${namespaceAlias}.${join.target[0]}" AS "__join_connection",
  )
  AS ${tableAlias}
  ON ${on}`;
}

import _ from "lodash";
import { format } from "sql-formatter";
import { match } from "ts-pattern";

import { NamePath } from "./build";
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
  switch (expr?.kind) {
    case undefined: {
      return "TRUE = TRUE";
    }
    case "alias": {
      return namepathToQuotedPair(expr.value);
    }
    case "literal": {
      return match(expr.literal)
        .with({ kind: "integer" }, { kind: "float" }, ({ value }) => `${value}`)
        .with({ kind: "string" }, ({ value }) => `'${value}'`)
        .with({ kind: "boolean" }, ({ value }) => (value ? "TRUE" : "FALSE"))
        .with({ kind: "null" }, () => "NULL")
        .exhaustive();
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
        case "count": {
          return `COALESCE(${stringifyFn("count", expr.args)}, 0)`;
        }
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
          const subquery = queryPlanToString(join.plan, true);
          return `
    ${join.joinType.toUpperCase()} JOIN (${subquery})
    AS ${namepathToQuoted(join.namePath)}
    ON ${namepathToQuotedPair(join.joinOn[0])} = ${namepathToQuotedPair(join.joinOn[1])}`;
        }
        case "inline": {
          return `
    ${join.joinType.toUpperCase()} JOIN "${join.modelName.toLowerCase()}" AS ${namepathToQuoted(
            join.namePath
          )}
    ON ${namepathToQuotedPair(join.joinOn[0])} = ${namepathToQuotedPair(join.joinOn[1])}
    `;
        }
      }
    })
    .join("\n");
}

export function queryPlanToString(plan: QueryPlan, isSubquery = false): string {
  const selectAllFrag = `${namepathToQuoted(plan.fromPath)}.*,
  ${namepathToQuotedPair([plan.entry, "id"])} AS "__join_connection"`;

  const selectFrag = plan.select
    ? Object.entries(plan.select)
        .map(([alias, expr]) => `${exprToString(expr)} AS "${alias}"`)
        .join(", ")
    : selectAllFrag;

  const limitFrag = plan.limit ? `LIMIT ${plan.limit}` : "";
  const orderFrag = plan.orderBy
    ? `ORDER BY ${plan.orderBy.map(([expr, dir]): string => `${exprToString(expr)} ${dir}`)}`
    : "";
  const offsetFrag = plan.offset ? `OFFSET ${plan.offset}` : "";

  const joinFrags = joinsToString(plan.joins);
  const whereFrag = plan.filter ? `WHERE ${exprToString(plan.filter)}` : "";

  const groupByItems = plan.groupBy.map(_.unary(namepathToQuotedPair));
  const groupByFrag = groupByItems.length > 0 ? `GROUP BY ${groupByItems}` : "";

  if (isSubquery && (plan.limit || plan.offset)) {
    /**
     * NOTE: This doesn't work if query plan defines `offset` without `limit`!
     */
    const offset = plan.offset ?? 0;
    const sql = `
    SELECT * FROM
      (SELECT ${selectFrag},
        ROW_NUMBER() OVER (PARTITION BY "${plan.entry}"."id" ${orderFrag}) AS "__row_number"
      FROM "${plan.entry.toLowerCase()}" AS "${plan.entry}"
      ${joinFrags}
      ${whereFrag}
      ) AS topn
      WHERE topn."__row_number" <= ${plan.limit! + offset} AND topn."__row_number" > ${offset}
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return format(sql, { paramTypes: { named: [":", ":@" as any] }, language: "postgresql" });
  }

  const sql = `
  SELECT ${selectFrag}
  FROM "${plan.entry.toLowerCase()}" AS "${plan.entry}"
  ${joinFrags}
  ${whereFrag}
  ${groupByFrag}
  ${orderFrag}
  ${limitFrag}
  ${offsetFrag}
  `;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return format(sql, { paramTypes: { named: [":", ":@" as any] }, language: "postgresql" });
}

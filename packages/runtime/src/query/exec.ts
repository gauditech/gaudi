import { ensureEqual, ensureNot } from "@gaudi/compiler/dist/common/utils";
import { TypeCardinality } from "@gaudi/compiler/dist/compiler/ast/type";
import {
  Definition,
  QueryDef,
  SelectItem,
  TypedExprDef,
} from "@gaudi/compiler/dist/types/definition";
import _ from "lodash";

import { executeHook } from "../hooks";

import {
  GAUDI_INTERNAL_TARGET_ID_ALIAS,
  NamePath,
  QueryTree,
  queryFromParts,
  selectableId,
} from "./build";
import { buildQueryPlan } from "./queryPlan";
import { queryPlanToString } from "./stringify";

import { Storage } from "@runtime/server/context";
import { DbConn } from "@runtime/server/dbConn";

export interface NestedRow {
  [key: string]: string | number | boolean | NestedRow | NestedRow[];
}

export interface Row {
  [key: string]: string | number | boolean;
}

export async function executeQuery(
  conn: DbConn,
  def: Definition,
  query: QueryDef,
  ctx: Storage,
  contextIds: number[]
): Promise<NestedRow[]> {
  const sqlTpl = queryPlanToString(buildQueryPlan(def, query)).replace(
    ":@context_ids",
    `(${contextIds.map((_, index) => `:context_id_${index}`).join(", ")})`
  );
  const idMap = Object.fromEntries(contextIds.map((id, index) => [`context_id_${index}`, id]));
  let results = await conn.raw(sqlTpl, { ...ctx.flatten(), ...idMap });

  // sqlite vs postgres drivers compat
  if ("rows" in results) {
    results = results.rows;
  }

  return results.map((row: Row): Row => {
    const cast = query.select.map((item: SelectItem): [string, string | number | boolean] => {
      const value = row[item.alias];
      // FIXME this casts strings that are expected to be integers
      // but it should be some kind of bigint instead
      if (item.kind === "expression") {
        if (item.type.kind === "integer" && typeof value === "string") {
          return [item.alias, parseInt(value, 10)];
        }
        if (item.type.kind === "boolean" && typeof value === "number") {
          return [item.alias, !!value];
        }
      }
      return [item.alias, value];
    });
    return Object.fromEntries(cast) as Row;
  });
}

export function castToCardinality(
  results: NestedRow[],
  cardinality: TypeCardinality
): NestedRow | NestedRow[] {
  if (cardinality === "nullable" || cardinality === "one") {
    ensureEqual(
      results.length <= 1,
      true,
      `Expected a single element but found multiple in a list`
    );
    const result = results[0] ?? null;
    if (cardinality === "one" && result == null) {
      throw Error(`Failed to get result from query with "one" cardinality`);
    }
    return result;
  } else {
    return results;
  }
}

export async function executeQueryTree(
  conn: DbConn,
  def: Definition,
  qt: QueryTree,
  ctx: Storage,
  contextIds: number[]
): Promise<NestedRow[]> {
  const results = await executeQuery(conn, def, qt.query, ctx, contextIds);
  if (results.length === 0) return [];

  const resultIds = qt.queryIdAlias
    ? _.uniq(results.map((r) => r[qt.queryIdAlias!] as number))
    : [];

  // tree
  for (const rel of qt.related) {
    const noAliasErrMsg = "Query has nested selects but 'id' field was not found in the parent";
    ensureNot(qt.queryIdAlias, undefined, noAliasErrMsg);

    const relResults = await executeQueryTree(conn, def, rel, ctx, resultIds);
    const groupedById = _.groupBy(relResults, "__join_connection");
    results.forEach((r) => {
      const relResultsForId = (groupedById[r[qt.queryIdAlias!] as number] ?? []).map((relR) =>
        _.omit(relR, "__join_connection")
      );
      Object.assign(r, {
        [rel.name]: castToCardinality(relResultsForId, rel.query.retCardinality),
      });
    });
  }

  // execute all queries in all hooks one by one
  for (const hook of qt.hooks) {
    // collect hook arg queries
    const argResults: Record<string, NestedRow[]> = {};
    for (const arg of hook.args) {
      const res = await executeQueryTree(conn, def, arg.query, ctx, resultIds);
      argResults[arg.name] = res;
    }

    // for each entry in results, take their arg results and execute hook
    for (const result of results) {
      const args = Object.fromEntries(
        hook.args.map((arg) => {
          const r = argResults[arg.name]
            .filter((res) => res["__join_connection"] === result[qt.queryIdAlias!])
            .map((r) => _.omit(r, "__join_connection"));
          return [arg.name, castToCardinality(r, arg.query.query.retCardinality)];
        })
      );

      result[hook.name] = await executeHook(def, hook.hook, args);
    }
  }
  if (qt.queryIdAlias === GAUDI_INTERNAL_TARGET_ID_ALIAS) {
    return results.map((r) => _.omit(r, GAUDI_INTERNAL_TARGET_ID_ALIAS));
  }
  return results;
}

export async function findIdBy(
  def: Definition,
  conn: DbConn,
  modelName: string,
  targetPath: NamePath,
  value: unknown
): Promise<number | undefined> {
  const filter: TypedExprDef = {
    kind: "function",
    name: "is",
    args: [
      { kind: "identifier-path", namePath: [modelName, ...targetPath] },
      { kind: "alias-reference", path: ["findBy_input"], source: undefined },
    ],
  };
  const query = queryFromParts(def, "findBy", [modelName], filter, [selectableId([modelName])]);
  const [result] = await executeQuery(conn, def, query, new Storage({ findBy_input: value }), []);

  if (!result) return undefined;
  return (result[GAUDI_INTERNAL_TARGET_ID_ALIAS] as number) ?? undefined;
}

// ----- QueryExecutor

/**
 * Allows execution of queries without having the knowledge of DB connection.
 * Also, allows easier creation of test mockups.
 */
export type QueryExecutor = {
  executeQuery(
    def: Definition,
    q: QueryDef,
    ctx: Storage,
    contextIds: number[]
  ): Promise<NestedRow[]>;

  executeQueryTree(
    def: Definition,
    qt: QueryTree,
    ctx: Storage,
    contextIds: number[]
  ): Promise<NestedRow[]>;
};

/**
 * Function that creates default implementation of `QueryExecutor`.
 */
export function createQueryExecutor(dbConn: DbConn): QueryExecutor {
  return {
    executeQuery(def, q, ctx, contextIds) {
      return executeQuery(dbConn, def, q, ctx, contextIds);
    },

    executeQueryTree(def, qt, ctx, contextIds) {
      return executeQueryTree(dbConn, def, qt, ctx, contextIds);
    },
  };
}

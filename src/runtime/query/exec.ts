import _ from "lodash";

import { executeHook } from "../hooks";
import { Vars } from "../server/vars";

import { QueryTree, selectableId } from "./build";
import { buildQueryPlan } from "./sqlstringify/queryPlan";
import { queryPlanToString } from "./sqlstringify/stringify";

import { ensureEqual } from "@src/common/utils";
import { getTypedPath } from "@src/composer/utils";
import logger from "@src/logger";
import { DbConn } from "@src/runtime/server/dbConn";
import { Definition, QueryDef, SelectItem } from "@src/types/definition";

export type Result = {
  rowCount: number;
  rows: Row[];
};

export interface NestedRow {
  id: number;
  [key: string]: string | number | NestedRow[];
}

export interface Row {
  id: number;
  [key: string]: string | number;
}

export async function executeQuery(
  conn: DbConn,
  def: Definition,
  q: QueryDef,
  params: Vars,
  contextIds: number[]
): Promise<NestedRow[]> {
  const hasId = q.select.find((s) => s.kind === "field" && s.alias === "id");
  let query = q;
  if (!hasId) {
    query = { ...q, select: [...q.select, selectableId(def, query.fromPath)] };
  }
  const sqlTpl = queryPlanToString(buildQueryPlan(def, query)).replace(
    ":@context_ids",
    `(${contextIds.map((_, index) => `:context_id_${index}`).join(", ")})`
  );
  const idMap = Object.fromEntries(contextIds.map((id, index) => [`context_id_${index}`, id]));
  console.info(sqlTpl);
  const result: Result = await conn.raw(sqlTpl, { ...params.all(), ...idMap });
  return result.rows.map((row: Row): Row => {
    // FIXME find results of aggregates and cast to integers, since `node-postgres`
    // makes them strings due to loss of precision (BigInt)

    const cast = query.select.map((item: SelectItem): [string, string | number] => {
      const value = row[item.alias];
      if (item.kind === "aggregate" && typeof value === "string") {
        return [item.alias, parseInt(value, 10)];
      } else {
        return [item.alias, value];
      }
    });
    return Object.fromEntries(cast) as Row;
  });
  // return result.rows;
}

export async function executeQueryTree(
  conn: DbConn,
  def: Definition,
  qt: QueryTree,
  params: Vars,
  contextIds: number[]
): Promise<NestedRow[]> {
  const results = await executeQuery(conn, def, qt.query, params, contextIds);
  if (results.length === 0) return [];
  const resultIds = _.uniq(results.map((r) => r.id));

  // tree
  for (const rel of qt.related) {
    const relResults = await executeQueryTree(conn, def, rel, params, resultIds);
    const groupedById = _.groupBy(relResults, "__join_connection");
    results.forEach((r) => {
      const relResultsForId = (groupedById[r.id] ?? []).map((relR) =>
        _.omit(relR, "__join_connection")
      );
      // if property kind is reference (todo: unique relationships in general)
      // unwrap from the array
      const tpath = getTypedPath(def, rel.query.fromPath, {});
      logger.silly("Rel kind", _.last(tpath.nodes)?.kind);
      if (_.last(tpath.nodes)?.kind === "reference") {
        ensureEqual(
          relResultsForId.length <= 1,
          true,
          `Expected a single element but found multiple in a list`
        );
        Object.assign(r, { [rel.name]: relResultsForId[0] ?? null });
      } else {
        Object.assign(r, { [rel.name]: relResultsForId });
      }
    });
  }

  // execute all queries in all hooks one by one
  for (const hook of qt.hooks) {
    // collect hook arg queries
    const argResults: Record<string, NestedRow[]> = {};
    for (const arg of hook.args) {
      const res = await executeQueryTree(conn, def, arg.query, params, resultIds);
      argResults[arg.name] = res;
    }

    // for each entry in results, take their arg results and execute hook
    for (const result of results) {
      const args = Object.fromEntries(
        hook.args.map((arg) => [
          arg.name,
          _.omit(
            // FIXME we shouldn't have `[0]` here but we lack type checking feature
            // to figure out the query cardinality so we hardcode "one" for now...
            argResults[arg.name].filter((res) => res["__join_connection"] === result.id)[0],
            "__join_connection"
          ),
        ])
      );

      result[hook.name] = await executeHook(def, hook.hook, args);
    }
  }

  return results;
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
    params: Vars,
    contextIds: number[]
  ): Promise<NestedRow[]>;

  executeQueryTree(
    def: Definition,
    qt: QueryTree,
    params: Vars,
    contextIds: number[]
  ): Promise<NestedRow[]>;
};

/**
 * Function that creates default implementation of `QueryExecutor`.
 */
export function createQueryExecutor(dbConn: DbConn): QueryExecutor {
  return {
    executeQuery(def, q, params, contextIds) {
      return executeQuery(dbConn, def, q, params, contextIds);
    },

    executeQueryTree(def, qt, params, contextIds) {
      return executeQueryTree(dbConn, def, qt, params, contextIds);
    },
  };
}

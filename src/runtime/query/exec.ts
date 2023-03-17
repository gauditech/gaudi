import _ from "lodash";

import { executeHook } from "../hooks";
import { Vars } from "../server/vars";

import { QueryTree, selectableId } from "./build";
import { queryToString } from "./stringify";

import { DbConn } from "@src/runtime/server/dbConn";
import { Definition, QueryDef } from "@src/types/definition";

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
  const sqlTpl = queryToString(def, query).replace(
    ":@context_ids",
    `(${contextIds.map((_, index) => `:context_id_${index}`).join(", ")})`
  );
  const idMap = Object.fromEntries(contextIds.map((id, index) => [`context_id_${index}`, id]));
  const result: Result = await conn.raw(sqlTpl, { ...params.all(), ...idMap });
  return result.rows;
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
      Object.assign(r, { [rel.name]: relResultsForId });
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

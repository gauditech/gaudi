import _ from "lodash";

import { executeHook } from "../hooks";
import { Vars } from "../server/vars";

import { GAUDI_INTERNAL_TARGET_ID_ALIAS, QueryTree } from "./build";
import { buildQueryPlan } from "./queryPlan";
import { queryPlanToString } from "./stringify";

import { ensureEqual, ensureNot } from "@src/common/utils";
import { getTypedPath } from "@src/composer/utils";
import logger from "@src/logger";
import { DbConn } from "@src/runtime/server/dbConn";
import { Definition, QueryDef, SelectItem } from "@src/types/definition";

export type Result = {
  rowCount: number;
  rows: Row[];
};

export interface NestedRow {
  [key: string]: string | number | NestedRow[];
}

export interface Row {
  [key: string]: string | number;
}

export async function executeQuery(
  conn: DbConn,
  def: Definition,
  query: QueryDef,
  params: Vars,
  contextIds: number[]
): Promise<NestedRow[]> {
  const sqlTpl = queryPlanToString(buildQueryPlan(def, query)).replace(
    ":@context_ids",
    `(${contextIds.map((_, index) => `:context_id_${index}`).join(", ")})`
  );
  const idMap = Object.fromEntries(contextIds.map((id, index) => [`context_id_${index}`, id]));
  const result: Result = await conn.raw(sqlTpl, { ...params.all(), ...idMap });
  return result.rows.map((row: Row): Row => {
    const cast = query.select.map((item: SelectItem): [string, string | number] => {
      const value = row[item.alias];
      // FIXME this casts strings that are expected to be integers
      // but it should be some kind of bigint instead
      if (item.kind === "expression" && item.type.kind === "integer" && typeof value === "string") {
        return [item.alias, parseInt(value, 10)];
      } else {
        return [item.alias, value];
      }
    });
    return Object.fromEntries(cast) as Row;
  });
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

  const resultIds = qt.queryIdAlias
    ? _.uniq(results.map((r) => r[qt.queryIdAlias!] as number))
    : [];

  // tree
  for (const rel of qt.related) {
    const noAliasErrMsg = "Query has nested selects but 'id' field was not found in the parent";
    ensureNot(qt.queryIdAlias, undefined, noAliasErrMsg);

    const relResults = await executeQueryTree(conn, def, rel, params, resultIds);
    const groupedById = _.groupBy(relResults, "__join_connection");
    results.forEach((r) => {
      const relResultsForId = (groupedById[r[qt.queryIdAlias!] as number] ?? []).map((relR) =>
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
            argResults[arg.name].filter(
              (res) => res["__join_connection"] === result[qt.queryIdAlias!]
            )[0],
            "__join_connection"
          ),
        ])
      );

      result[hook.name] = await executeHook(def, hook.hook, args);
    }
  }
  if (qt.queryIdAlias === GAUDI_INTERNAL_TARGET_ID_ALIAS) {
    return results.map((r) => _.omit(r, GAUDI_INTERNAL_TARGET_ID_ALIAS));
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

import { Knex } from "knex";
import _ from "lodash";

import { selectableId } from "./buildQuery";
import { debugQuery } from "./debugQuery";
import { queryToString } from "./queryStr";

import { Definition, QueryDef, QueryTree } from "@src/types/definition";

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

export type Params = Record<string, string | number>;

export async function executeQuery(
  conn: Knex | Knex.Transaction,
  def: Definition,
  q: QueryDef,
  params: Params,
  contextIds: number[]
): Promise<NestedRow[]> {
  const hasId = q.select.find((s) => s.kind === "field" && s.alias === "id");
  let query = q;
  if (!hasId) {
    query = { ...q, select: [...q.select, selectableId(def, query.fromPath)] };
  }
  debugQuery(query);
  const sqlTpl = queryToString(def, query).replace(
    ":@context_ids",
    `(${contextIds.map((_, index) => `:context_id_${index}`).join(", ")})`
  );
  const idMap = Object.fromEntries(contextIds.map((id, index) => [`context_id_${index}`, id]));
  const result: Result = await conn.raw(sqlTpl, { ...params, ...idMap });
  return result.rows;
}

export async function executeQueryTree(
  conn: Knex | Knex.Transaction,
  def: Definition,
  qt: QueryTree,
  params: Params,
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
  return results;
}

import _ from "lodash";

import { db } from "../server/dbConn";

import { queriesFromSelect, selectToSelectable, selectableId } from "./buildQuery";
import { debugQuery } from "./debugQuery";
import { queryToString } from "./queryStr";

import { getRef } from "@src/common/refs";
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

export type Params = Record<string, string | number>;

export async function executeQuery(
  def: Definition,
  query: QueryDef,
  params: Params,
  ids: number[]
): Promise<NestedRow[]> {
  // FIXME remove id if not needed
  const select = selectToSelectable(query.select);
  const hasId = select.find((s) => s.kind === "field" && s.alias === "id");
  if (!hasId) {
    select.push(selectableId(def, query.fromPath));
  }
  const exQuery = { ...query, select };

  debugQuery(exQuery);
  const sqlTpl = queryToString(def, exQuery).replace(
    ":@context_ids",
    `(${ids.map((_, index) => `:context_id_${index}`).join(", ")})`
  );
  // ids to params
  const idMap = Object.fromEntries(ids.map((id, index) => [`context_id_${index}`, id]));
  const result: Result = await db.raw(sqlTpl, { ...params, ...idMap });
  if (result.rowCount === 0) {
    return [];
  }
  const resultRows: NestedRow[] = result.rows;
  const resultIds = _.uniq(resultRows.map((r) => r.id));
  const { value: model } = getRef<"model">(def, query.retType);
  // related queries
  const queries = queriesFromSelect(def, model, query.select);
  // console.dir(queries, { depth: 10, colors: true });
  const resultGroups = await Promise.all(
    queries.map(async (q) => {
      const res = await executeQuery(def, q, {}, resultIds);
      const rows = res;
      const groups = _.groupBy(rows, "__join_connection");

      return { name: q.name, groups };
    })
  );
  // merge
  resultRows.forEach((res) => {
    resultGroups.forEach((rg) => {
      // remove "__join_connection" while assigning the group of related results
      (res as any)[rg.name] = (rg.groups[res.id] ?? []).map((row) =>
        _.omit(row, "__join_connection")
      );
    });
  });

  return resultRows;
}

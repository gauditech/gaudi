import _ from "lodash";

import { db } from "../server/dbConn";

import { selectToSelectable, selectableId } from "./buildQuery";
import { queryToString } from "./queryStr";

import { Definition, QueryDef } from "@src/types/definition";

export type Result = {
  rowCount: number;
  rows: Record<string, any>[];
};

export type Params = Record<string, string | number>;
type Row = Record<string, string | number>;

export async function executeQuery(
  def: Definition,
  query: QueryDef,
  params: Params,
  ids: number[]
): Promise<Result> {
  // FIXME remove id if not needed
  const select = selectToSelectable(query.select);
  const hasId = select.find((s) => s.kind === "field" && s.name === "id");
  if (!hasId) {
    select.push(selectableId(def, query.fromPath));
  }
  const sqlTpl = queryToString(def, { ...query, select }).replace(
    ":@context_ids",
    `(${ids.map((_, index) => `:context_id_${index}`).join(", ")})`
  );
  // ids to params
  const idMap = Object.fromEntries(ids.map((id, index) => [`context_id_${index}`, id]));
  const result = await db.raw(sqlTpl, { ...params, ...idMap });

  // related queries
  const resultIds = result.rows.map((r: Row) => r.id);
  // merge

  return result;
}

import { QueryTree } from "@src/runtime/query/build.js";
import { NestedRow, QueryExecutor } from "@src/runtime/query/exec.js";
import { Vars } from "@src/runtime/server/vars.js";
import { Definition, QueryDef } from "@src/types/definition.js";

/**
 * Creates dummy query executor wich always return empty row.
 *
 * TODO: add abbility to define dummy return data
 */
export function mockQueryExecutor(): QueryExecutor {
  return {
    executeQuery(
      _def: Definition,
      _q: QueryDef,
      _params: Vars,
      _contextIds: number[]
    ): Promise<NestedRow[]> {
      return Promise.resolve([]);
    },

    executeQueryTree(
      _def: Definition,
      _qt: QueryTree,
      _params: Vars,
      _contextIds: number[]
    ): Promise<NestedRow[]> {
      return Promise.resolve([]);
    },
  };
}

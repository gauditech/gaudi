import { compileBlueprint } from "@src/compiler";
import { compose } from "@src/composer/composer";
import { QueryTree } from "@src/runtime/query/build";
import { NestedRow, QueryExecutor } from "@src/runtime/query/exec";
import { Vars } from "@src/runtime/server/vars";
import { CustomManyEndpointDef, Definition, FetchAction, QueryDef } from "@src/types/definition";

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
/**
 * Provide models blueprint, and query blueprint separately.
 * This function will compile a blueprint and extract the query definition,
 * so you can use it in tests.
 */

export function makeTestQuery(models: string, query: string): { def: Definition; query: QueryDef } {
  const bp = `
  ${models}

  model TestHelperModel {}
  api {
    entrypoint TestHelperModel {
      custom endpoint {
        method GET
        cardinality many
        path "/test"
        action {
          fetch as q {
            ${query}
          }
        }
      }
    }
  }
  `;
  const def = compose(compileBlueprint(bp));
  const endpoint = def.apis[0].entrypoints[0].endpoints[0] as CustomManyEndpointDef;
  const action = endpoint.actions[0] as FetchAction;
  return { def, query: action.query };
}

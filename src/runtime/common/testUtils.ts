import { compileToAST } from "@src/compiler";
import { compilerErrorsToString } from "@src/compiler/compilerError";
import { migrate } from "@src/compiler/migrate";
import { compose } from "@src/composer/composer";
import { QueryTree } from "@src/runtime/query/build";
import { NestedRow, QueryExecutor } from "@src/runtime/query/exec";
import { Vars } from "@src/runtime/server/vars";
import { CustomManyEndpointDef, Definition, QueryAction, QueryDef } from "@src/types/definition";

/**
 * Helper function that compiles directly to definition. This is used in tests.
 */
export function compileFromString(source: string): Definition {
  const inputs = [{ source }];
  const { ast, errors } = compileToAST([{ source }]);
  if (errors) {
    const errorString = compilerErrorsToString(inputs, errors);
    throw new Error(`Failed to compile:\n${errorString}`);
  }
  return compose(migrate(ast));
}

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
          ${query}
        }
      }
    }
  }
  `;
  const def = compileFromString(bp);
  const endpoint = def.apis[0].entrypoints[0].endpoints[0] as CustomManyEndpointDef;
  const action = endpoint.actions[0] as QueryAction;
  return { def, query: action.query };
}

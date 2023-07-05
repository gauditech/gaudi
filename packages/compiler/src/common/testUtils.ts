import { compileToAST } from "@compiler/compiler";
import { compilerErrorsToString } from "@compiler/compiler/compilerError";
import { migrate } from "@compiler/compiler/migrate";
import { compose } from "@compiler/composer/composer";
import { Definition } from "@compiler/types/definition";

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

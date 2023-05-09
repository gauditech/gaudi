import { ILexingError, IRecognitionException } from "chevrotain";
import _ from "lodash";

import { ProjectASTs, TokenData } from "./ast/ast.js";
import { checkForm } from "./checkForm.js";
import { CompilerError, ErrorCode, compilerErrorsToString } from "./compilerError.js";
import * as L from "./lexer.js";
import { migrate } from "./migrate.js";
import { getTokenData, parser } from "./parser.js";
import { AuthPlugin } from "./plugins/authenticator.js";
import { resolve } from "./resolver.js";

import { kindFind } from "@src/common/kindFilter.js";
import { Specification } from "@src/types/specification.js";

export type CompileResult = {
  ast: ProjectASTs | undefined;
  errors: CompilerError[];
};

// plugin compilation is the first step in resolving
function compilePlugins(projectASTs: ProjectASTs) {
  const authenticator = kindFind(projectASTs.document, "authenticator");
  if (authenticator) {
    const { ast, errors } = compileToAST(AuthPlugin.code);
    if (!ast || errors.length > 0) {
      let errorString;
      if (errors.length > 0) {
        errorString = compilerErrorsToString("plugin:auth", AuthPlugin.code, errors);
      } else {
        errorString = "Unknown compilation error";
      }
      throw new Error(`Failed to compile auth plugin:\n${errorString}`);
    }
    projectASTs.plugins["auth"] = ast.document;
  }
}

export function compileToAST(source: string): CompileResult {
  const lexerResult = L.lexer.tokenize(source);
  parser.input = lexerResult.tokens;

  const errors = lexerResult.errors.map(toCompilerError);

  const ast = parser.document();

  errors.push(...parser.errors.map(toCompilerError));

  if (ast && errors.length === 0) {
    compilePlugins(ast);
    errors.push(...checkForm(ast));
    errors.push(...resolve(ast));
  }

  return { ast, errors };
}

export function compileToOldSpec(source: string): Specification {
  const { ast, errors } = compileToAST(source);
  if (errors.length > 0) {
    throw errors[0];
  } else if (!ast) {
    throw Error("Unknown compiler error");
  }
  return migrate(ast);
}

function toCompilerError(error: ILexingError | IRecognitionException) {
  let tokenData: TokenData;
  if ("token" in error) {
    tokenData = getTokenData(error.token);
  } else {
    tokenData = { start: error.offset, end: error.offset + 1 };
  }
  return new CompilerError(tokenData, ErrorCode.ParserError, { message: error.message });
}

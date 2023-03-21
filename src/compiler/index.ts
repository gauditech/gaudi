import { ILexingError, IRecognitionException } from "chevrotain";
import _ from "lodash";

import { Definition, TokenData } from "./ast/ast";
import { checkForm } from "./checkForm";
import { CompilerError, ErrorCode, compilerErrorsToString } from "./compilerError";
import * as L from "./lexer";
import { migrate } from "./migrate";
import { getTokenData, parser } from "./parser";
import { resolve } from "./resolver";

import { Specification } from "@src/types/specification";

export type CompileResult = {
  ast: Definition | undefined;
  errors: CompilerError[];
};

export function compileToAST(source: string): CompileResult {
  const lexerResult = L.lexer.tokenize(source);
  parser.input = lexerResult.tokens;

  const errors = lexerResult.errors.map(toCompilerError);

  const ast = parser.definition();

  errors.push(...parser.errors.map(toCompilerError));

  if (ast) {
    errors.push(...checkForm(ast));
    errors.push(...resolve(ast));
  }

  return { ast, errors };
}

export function compileToOldSpec(source: string): Specification {
  const { ast, errors } = compileToAST(source);
  if (errors.length > 0) {
    console.error(compilerErrorsToString("unknown", source, errors));
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

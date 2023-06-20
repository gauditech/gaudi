import fs from "fs";

import { ILexingError, IRecognitionException } from "chevrotain";
import _ from "lodash";

import { ProjectASTs, TokenData } from "./ast/ast";
import { checkForm } from "./checkForm";
import { CompilerError, ErrorCode, compilerErrorsToString } from "./compilerError";
import * as L from "./lexer";
import { migrate } from "./migrate";
import { getTokenData, parser } from "./parser";
import { AuthPlugin } from "./plugins/authenticator";
import { resolve } from "./resolver";

import { kindFind } from "@src/common/kindFilter";
import { compose } from "@src/composer/composer";
import { Definition } from "@src/types/definition";
import { Specification } from "@src/types/specification";

export type CompileResult = {
  ast: ProjectASTs | undefined;
  errors: CompilerError[];
};

// plugin compilation is the first step in resolving
function compilePlugins(projectASTs: ProjectASTs) {
  const authenticator = kindFind(projectASTs.document, "authenticator");
  if (authenticator) {
    const { ast, errors } = compileToAST([
      { source: AuthPlugin.code, filename: "plugin::auth.basic.gaudi" },
    ]);
    if (!ast || errors.length > 0) {
      let errorString;
      if (errors.length > 0) {
        errorString = compilerErrorsToString(AuthPlugin.code, errors);
      } else {
        errorString = "Unknown compilation error";
      }
      throw new Error(`Failed to compile auth plugin:\n${errorString}`);
    }
    projectASTs.plugins.push(ast.document);
  }
}

type Input = { source: string; filename?: string };
export function compileToAST(inputs: Input[]): CompileResult {
  const ast: ProjectASTs = {
    plugins: [],
    document: [],
  };
  const allErrors: CompilerError[] = [];
  for (const { source, filename } of inputs) {
    const lexerResult = L.lexer.tokenize(source);
    parser.input = lexerResult.tokens;
    parser.filename = filename ?? ":unset:";
    const fileErrors = lexerResult.errors.map((e) => toCompilerError(e, parser.filename));
    const document = parser.document();
    fileErrors.push(...parser.errors.map((e) => toCompilerError(e, parser.filename)));
    allErrors.push(...fileErrors);
    if (document && fileErrors.length === 0) {
      ast.document.push(...document);
    }
  }
  if (allErrors.length === 0) {
    compilePlugins(ast);
    allErrors.push(...checkForm(ast));
    allErrors.push(...resolve(ast));
  }

  return { ast, errors: allErrors };
}

export function compileFromFiles(filenames: string[]): Specification {
  const { ast, errors } = compileToAST(
    filenames.map((filename) => ({
      filename,
      source: fs.readFileSync(filename).toString("utf-8"),
    }))
  );
  if (errors.length > 0) {
    throw errors[0];
  } else if (!ast) {
    throw Error("Unknown compiler error");
  }
  return migrate(ast);
}

/**
 * Helper function that compiles directly to definition. This is used in tests.
 */
export function compileFromString(source: string): Definition {
  const { ast, errors } = compileToAST([{ source }]);
  if (errors.length > 0) {
    throw errors[0];
  } else if (!ast) {
    throw Error("Unknown compiler error");
  }
  return compose(migrate(ast));
}

function toCompilerError(error: ILexingError | IRecognitionException, filename: string) {
  let tokenData: TokenData;
  if ("token" in error) {
    tokenData = getTokenData(filename, error.token);
  } else {
    tokenData = { start: error.offset, end: error.offset + 1, filename };
  }
  return new CompilerError(tokenData, ErrorCode.ParserError, { message: error.message });
}

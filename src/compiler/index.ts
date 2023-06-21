import fs from "fs";

import { ILexingError, IRecognitionException } from "chevrotain";
import { sync as glob } from "fast-glob";
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

export type CompileResult =
  | { ast: ProjectASTs; errors: undefined }
  | { ast: ProjectASTs | undefined; errors: CompilerError[] };

// plugin compilation is the first step in resolving
function compilePlugins(projectASTs: ProjectASTs) {
  const authenticator = kindFind(projectASTs.document, "authenticator");
  if (authenticator) {
    const inputs = [{ source: AuthPlugin.code, filename: "plugin::auth.basic.gaudi" }];
    const { ast, errors } = compileToAST(inputs);
    if (errors) {
      const errorString = compilerErrorsToString(inputs, errors);
      throw new Error(`Failed to compile auth plugin:\n${errorString}`);
    }
    projectASTs.plugins.push(ast.document);
  }
}

export type Input = { source: string; filename?: string };
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

  if (allErrors.length === 0) {
    if (ast) {
      return { ast, errors: undefined };
    } else {
      throw Error("Unexpected compilation error");
    }
  }
  return { ast, errors: allErrors };
}

export function compileFromFiles(filenames: string[]): Definition {
  const inputs = filenames.map((filename) => ({
    filename,
    source: fs.readFileSync(filename).toString("utf-8"),
  }));
  const { ast, errors } = compileToAST(inputs);
  if (errors) {
    const errorString = compilerErrorsToString(inputs, errors);
    throw new Error(`Failed to compile gaudi project:\n${errorString}`);
  }
  return compose(migrate(ast));
}

export function compileProject(rootDir: string): Definition {
  const filenames = glob(`${rootDir}/**/*.gaudi`);
  return compileFromFiles(filenames);
}

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

function toCompilerError(error: ILexingError | IRecognitionException, filename: string) {
  let tokenData: TokenData;
  if ("token" in error) {
    tokenData = getTokenData(filename, error.token);
  } else {
    tokenData = { start: error.offset, end: error.offset + 1, filename };
  }
  return new CompilerError(tokenData, ErrorCode.ParserError, { message: error.message });
}

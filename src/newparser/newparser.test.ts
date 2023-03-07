import * as fs from "fs";
import * as path from "path";

import { ILexingError, IRecognitionException } from "chevrotain";
import _ from "lodash";

import { TokenData } from "./ast/ast";
import { checkForm } from "./checkForm";
import { CompilerError, ErrorCode } from "./compilerError";
import { migrate } from "./migrate";
import { getTokenData, parse } from "./parser";
import { resolve } from "./resolver";

const folder = "./src/newparser/tests";
const sources = fs.readdirSync(folder);

describe("parser", () => {
  test.each(sources)("parse tests/%s", (sourceFilename) => {
    const sourcePath = path.join(folder, sourceFilename);
    const source = fs.readFileSync(sourcePath).toString();

    const result = parse(source);

    const errors = [
      ...(result.lexerErrors ?? []).map(toCompilerError),
      ...(result.parserErrors ?? []).map(toCompilerError),
    ];

    if (result.ast) {
      const checkFormErrors = checkForm(result.ast);
      const resolveErrors = resolve(result.ast);
      errors.push(...checkFormErrors, ...resolveErrors);

      if (result.success && checkFormErrors.length === 0 && resolveErrors.length === 0) {
        migrate(result.ast);
      }
    }

    logErrors(sourcePath, source, errors);
  });
});

function toCompilerError(error: ILexingError | IRecognitionException) {
  let tokenData: TokenData;
  if ("token" in error) {
    tokenData = getTokenData(error.token);
  } else {
    tokenData = { start: error.offset, end: error.offset + 1 };
  }
  return new CompilerError(tokenData, ErrorCode.ParserError, { message: error.message });
}

function logErrors(filename: string, source: string, errors: CompilerError[]) {
  if (errors.length === 0) return;

  const lineIndecies = [0];

  for (let i = 0; i < source.length; i++) {
    if (source.charAt(i) === "\n") {
      lineIndecies.push(i + 1);
    }
  }

  errors.forEach((error) => {
    const start = error.errorPosition.start;
    const end = error.errorPosition.end;
    const lineStart = _.findLast(lineIndecies, (i) => i < start) ?? 0;
    const lineEnd = _.find(lineIndecies, (i) => i > end) ?? source.length;

    const line = lineIndecies.indexOf(lineStart) + 1;
    const column = start - lineStart + 1;
    const length = end - start;

    let output = `${filename}:${line}:${column} - ${error.message}\n`;
    output += source.substring(lineStart, lineEnd);
    output += " ".repeat(column - 1) + "~".repeat(length + 1);
    console.log(output);
  });
}

import * as fs from "fs";

import { sync } from "fast-glob";
import _ from "lodash";

import { compileToAST } from "..";
import { compilerErrorsToString } from "../compilerError";
import { migrate } from "../migrate";

const folder = "./src/compiler/tests/successful";
const filenames = sync(`${folder}/*.gaudi`);

describe("compiler", () => {
  test.each(filenames)("compile to AST and migrate: tests/%s", (sourceFilename) => {
    const source = fs.readFileSync(sourceFilename).toString("utf-8");

    const { ast, errors } = compileToAST([{ source, filename: sourceFilename }]);

    if (ast && errors.length === 0) {
      migrate(ast);
    }

    console.log(compilerErrorsToString(source, errors));
    expect(errors.length).toBe(0);
  });

  test("multi-file project", () => {
    const multiFilenames = sync(`${folder}/multi/*.gaudi`);
    const { ast, errors } = compileToAST(
      multiFilenames.map((filename) => ({
        filename,
        source: fs.readFileSync(filename).toString("utf-8"),
      }))
    );
    if (ast && errors.length === 0) {
      migrate(ast);
    }

    expect(errors.length).toBe(0);
  });
});

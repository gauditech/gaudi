import * as fs from "fs";
import * as path from "path";

import _ from "lodash";

import { compileToAST } from "..";
import { compilerErrorsToString } from "../compilerError";
import { migrate } from "../migrate";

const folder = "./src/compiler/tests/successfull";
const sources = fs.readdirSync(folder);

describe("compiler", () => {
  test.each(sources)("compile to AST and migrate: tests/%s", (sourceFilename) => {
    const sourcePath = path.join(folder, sourceFilename);
    const source = fs.readFileSync(sourcePath).toString();

    const { ast, errors } = compileToAST(source);

    if (ast && errors.length === 0) {
      migrate(ast);
      return;
    }

    console.log(compilerErrorsToString(sourcePath, source, errors));
    expect(errors.length).toBe(0);
  });
});

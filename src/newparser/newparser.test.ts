import * as fs from "fs";
import * as path from "path";

import _ from "lodash";

import { compilerErrorsToString } from "./compilerError";
import { migrate } from "./migrate";

import { compileToAST } from ".";

const folder = "./src/newparser/tests";
const sources = fs.readdirSync(folder);

describe("parser", () => {
  test.each(sources)("parse tests/%s", (sourceFilename) => {
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

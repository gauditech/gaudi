import * as fs from "fs";

import { sync } from "fast-glob";
import _ from "lodash";

import { compileWorkspace } from "..";

describe("compiler", () => {
  const folder = "./src/compiler/tests/successful";
  const filenames = sync(`${folder}/*.gaudi`);

  test.each(filenames)("compile to AST and migrate: tests/%s", (sourceFilename) => {
    expect(() => compileWorkspace([sourceFilename])).not.toThrowError();
  });

  test("multi-file project", () => {
    const multiFilenames = sync(`${folder}/multi/*.gaudi`);
    expect(() => compileWorkspace(multiFilenames)).not.toThrowError();
  });
});

import { sync } from "fast-glob";

import { compileFromFiles, compileProject } from "..";

import { readConfig } from "@compiler/config";

describe("compiler", () => {
  const directory = "./src/compiler/tests/successful";
  const filenames = sync(`${directory}/*.gaudi`);

  test.each(filenames)("compile to AST and migrate: %s", (sourceFilename) => {
    expect(() => compileFromFiles([sourceFilename])).not.toThrowError();
  });

  test("multi-file project", () => {
    const { inputDirectory } = readConfig(`${directory}/multi/gaudiconfig.yaml`);
    expect(() => compileProject(inputDirectory)).not.toThrowError();
  });
});

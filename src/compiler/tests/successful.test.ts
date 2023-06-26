import { sync } from "fast-glob";

import { compileFromFiles, compileProject } from "..";

import { readConfig } from "@src/config";

describe("compiler", () => {
  const folder = "./src/compiler/tests/successful";
  const filenames = sync(`${folder}/*.gaudi`);

  test.each(filenames)("compile to AST and migrate: tests/%s", (sourceFilename) => {
    expect(() => compileFromFiles([sourceFilename])).not.toThrowError();
  });

  test("multi-file project", () => {
    const { inputFolder } = readConfig(`${folder}/multi/gaudiconfig.yaml`);
    expect(() => compileProject(inputFolder)).not.toThrowError();
  });
});

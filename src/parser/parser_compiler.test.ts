import fs from "fs";

import { compile } from "../compiler/compiler";

import { parse } from "./parser";

import specification from "examples/git/specification.json";

const blueprint = fs.readFileSync("./examples/git/blueprint.gaudi").toString();

describe("parser", () => {
  it("parses git blueprint into correct AST", () => {
    expect(compile(parse(blueprint))).toEqual(specification);
  });
});

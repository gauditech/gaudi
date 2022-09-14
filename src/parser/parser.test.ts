import fs from "fs";

const blueprint = fs.readFileSync("./examples/git/blueprint.gaudi").toString();
import { parse } from "./parser";

import astInput from "examples/git/ast.json";

describe("parser", () => {
  it("parses git blueprint into correct AST", () => {
    expect(parse(blueprint)).toStrictEqual(astInput);
  });
});

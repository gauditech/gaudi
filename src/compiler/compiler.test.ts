import { compile } from "./compiler";

import ast from "examples/git/ast.json";
import specification from "examples/git/specification.json";

describe("parser", () => {
  it("parses git blueprint into correct AST", () => {
    expect(compile(ast as any)).toEqual(specification);
  });
});

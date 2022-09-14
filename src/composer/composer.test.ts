import { compose } from "./composer";

import definitionInput from "examples/git/definition.json";
import specificationInput from "examples/git/specification.json";

describe("compose models", () => {
  it("correctly composes the git example", () => {
    expect(compose(specificationInput)).toStrictEqual(definitionInput);
  });
});

import { compose } from "./composer";

import definitionInput from "examples/git/definition.json";
import specificationInput from "examples/git/specification.json";
import { Specification } from "src/types/specification";

describe("compose models", () => {
  it("correctly composes the git example", () => {
    expect(compose(specificationInput)).toStrictEqual(definitionInput);
  });

  it("fails on duplicate field name", () => {
    const specification: Specification = {
      models: [
        {
          name: "Org",
          fields: [
            { name: "name", type: "text" },
            { name: "name", type: "text" },
          ],
        },
      ],
    };
    expect(() => compose(specification)).toThrowError("Items not unique!");
  });
  it("fails on name colision between field and reference", () => {
    const specification: Specification = {
      models: [
        {
          name: "Org",
          fields: [{ name: "name", type: "text" }],
          references: [{ name: "name", toModel: "Org" }],
        },
      ],
    };
    expect(() => compose(specification)).toThrowError("Items not unique!");
  });
});

import definitionInput from "@examples/git/definition.json";
import specificationInput from "@examples/git/specification.json";

import { compose } from "./composer";

import { Specification } from "@src/types/specification";

describe("compose models", () => {
  it("correctly composes the git example", () => {
    expect(compose(specificationInput)).toStrictEqual(definitionInput);
  });

  it("fails on case insensitive duplicate field name", () => {
    const specification: Specification = {
      models: [
        {
          name: "Org",
          fields: [
            { name: "name", type: "text" },
            { name: "Name", type: "text" },
          ],
          relations: [],
          references: [],
          queries: [],
          computeds: [],
        },
      ],
      entrypoints: [],
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
          relations: [],
          queries: [],
          computeds: [],
        },
      ],
      entrypoints: [],
    };
    expect(() => compose(specification)).toThrowError("Items not unique!");
  });
});

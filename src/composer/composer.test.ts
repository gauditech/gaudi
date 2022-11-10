import { compose } from "./composer";

import { compile } from "@src/compiler/compiler";
import definitionInput from "@src/composer/tests/data/definition.json";
import specificationInput from "@src/composer/tests/data/specification.json";
import { parse } from "@src/parser/parser";
import { Specification } from "@src/types/specification";

describe("compose models", () => {
  it("doesn't crash on empty blueprint", () => {
    expect(() => compose(compile(parse("")))).not.toThrow();
  });
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
  it("fails when relation doesn't point to a reference", () => {
    const specification: Specification = {
      models: [
        {
          name: "Org",
          fields: [{ name: "name", type: "text" }],
          references: [],
          relations: [{ name: "repos", fromModel: "Repo", through: "name" }],
          queries: [],
          computeds: [],
        },
        {
          name: "Repo",
          fields: [{ name: "name", type: "text" }],
          references: [{ name: "org", toModel: "Org" }],
          relations: [],
          queries: [],
          computeds: [],
        },
      ],
      entrypoints: [],
    };
    expect(() => compose(specification)).toThrowError(
      "Expecting type reference but found a type field"
    );
  });
  it("detect infinite loop when resolving", () => {
    const bp = `
    model Org { reference no { to Unknown } }
    `;
    expect(() => compose(compile(parse(bp)))).toThrowError("infinite-loop");
  });
  it("parses validators", () => {
    const bp = `
    model Org {
      field adminEmail { type text, validate { min 4, max 100, isEmail } }
      field num_employees { type integer, validate { min 0, max 9999 } }
    }`;
    const def = compose(compile(parse(bp)));
    expect(def).toMatchSnapshot();
  });
  it("fails on invalid validator", () => {
    const bp = `
    model Org {
      field adminEmail { type text }
      field num_employees { type integer, validate { isEmail } }
    }`;
    const spec = compile(parse(bp));
    expect(() => compose(spec)).toThrowErrorMatchingInlineSnapshot(`"Unknown validator!"`);
  });
});

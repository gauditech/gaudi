import { compileToOldSpec, compose } from "../index.js";

describe("compose models", () => {
  it("doesn't crash on empty blueprint", () => {
    expect(() => compose(compileToOldSpec(""))).not.toThrow();
  });
  it("fails on case insensitive duplicate field name", () => {
    const bp = `
    model Org {
      field name { type string }
      field Name { type string }
    }
    `;
    expect(() => compose(compileToOldSpec(bp))).toThrowError("Items not unique!");
  });
  it("parses validators", () => {
    const bp = `
    model Org {
      field adminEmail { type string, validate { min 4, max 100, isEmail } }
      field num_employees { type integer, validate { min 0, max 9999 } }
    }`;
    const def = compose(compileToOldSpec(bp));
    expect(def.models).toMatchSnapshot();
  });
  it("fails on invalid validator", () => {
    const bp = `
    model Org {
      field adminEmail { type string }
      field num_employees { type integer, validate { isEmail } }
    }`;
    const spec = compileToOldSpec(bp);
    expect(() => compose(spec)).toThrowErrorMatchingInlineSnapshot(`"Unknown validator!"`);
  });
});

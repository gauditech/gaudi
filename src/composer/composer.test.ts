import { compileBlueprint, compose } from "../index";

describe("compose models", () => {
  it("doesn't crash on empty blueprint", () => {
    expect(() => compose(compileBlueprint(""))).not.toThrow();
  });
  it("parses validators", () => {
    const bp = `
    model Org {
      field adminEmail { type string, validate { min 4, max 100, isEmail } }
      field num_employees { type integer, validate { min 0, max 9999 } }
    }`;
    const def = compose(compileBlueprint(bp));
    expect(def.models).toMatchSnapshot();
  });
  it("fails on invalid validator", () => {
    const bp = `
    model Org {
      field adminEmail { type string }
      field num_employees { type integer, validate { isEmail } }
    }`;
    const spec = compileBlueprint(bp);
    expect(() => compose(spec)).toThrowErrorMatchingInlineSnapshot(`"Unknown validator!"`);
  });
});

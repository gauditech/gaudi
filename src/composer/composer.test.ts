import { compile, compose, parse } from "../index";

describe("compose models", () => {
  it("doesn't crash on empty blueprint", () => {
    expect(() => compose(compile(parse("")))).not.toThrow();
  });

  it("fails on case insensitive duplicate field name", () => {
    const bp = `
    model Org {
      field name { type text }
      field Name { type text }
    }
    `;

    expect(() => compose(compile(parse(bp)))).toThrowError("Items not unique!");
  });
  it("fails on name colision between field and reference", () => {
    const bp = `
    model Org {
      reference parent { to Org }
      field parent { type text }
    }
    `;
    expect(() => compose(compile(parse(bp)))).toThrowError("Items not unique!");
  });
  it("fails when relation doesn't point to a reference", () => {
    const bp = `
    model Org {
      reference parent { to Org }
      field name { type text }
      relation children { from Org, through name}
    }
    `;
    expect(() => compose(compile(parse(bp)))).toThrowError(
      "Expecting type reference but found a type field"
    );
  });
  it("fails when relation points to a reference for another model", () => {
    const bp = `
    model Foo {
      reference parent { to Foo }
      reference baz { to Baz }
    }
    model Baz {
      relation foos { from Foo, through parent }
    }
    `;
    expect(() => compose(compile(parse(bp)))).toThrowErrorMatchingInlineSnapshot(
      `"Relation Baz.foos is pointing to a reference referencing a model Foo"`
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

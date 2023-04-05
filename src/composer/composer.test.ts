import { compileToOldSpec, compose } from "../index";

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
  it("correctly fail when circular dependency is found", () => {
    const bp = `
    model Org {
      computed foo { bar + 1 }
      computed bar { foo - 1 }
    }
    `;
    expect(() => compose(compileToOldSpec(bp))).toThrowErrorMatchingInlineSnapshot(
      `"Couldn't resolve the spec. The following refs are unresolved: Org.bar, Org.foo"`
    );
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

describe("compiler errors", () => {
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
    expect(() => compileToOldSpec(bp)).toThrowErrorMatchingInlineSnapshot(
      `"This reference has incorrect model"`
    );
  });
  it("fails on name colision between field and reference", () => {
    const bp = `
    model Org {
      reference parent { to Org }
      field parent { type string }
    }
    `;
    expect(() => compileToOldSpec(bp)).toThrowError("Duplicate model member definition");
  });
  it("fails when relation doesn't point to a reference", () => {
    const bp = `
    model Org {
      reference parent { to Org }
      field name { type string }
      relation children { from Org, through name }
    }
    `;
    expect(() => compileToOldSpec(bp)).toThrowErrorMatchingInlineSnapshot(
      `"Model member must be one of [reference], but field member was found"`
    );
  });
  it("correctly fail when not able to resolve a ref", () => {
    const bp = `
    model Org { reference no { to UnknownModel } }
    `;
    expect(() => compileToOldSpec(bp)).toThrowErrorMatchingInlineSnapshot(
      `"Can't resolve model with this name"`
    );
  });
});

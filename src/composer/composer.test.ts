import { compileFromString } from "@src/runtime/common/testUtils";

describe("compose models", () => {
  it("doesn't crash on empty blueprint", () => {
    expect(() => compileFromString("")).not.toThrow();
  });

  it("parses validators", () => {
    const bp = `
    model Org {
      field adminEmail { type string, validate { min 4, max 100, isEmail } }
      field num_employees { type integer, validate { min 0, max 9999 } }
    }`;
    const def = compileFromString(bp);
    expect(def.models).toMatchSnapshot();
  });

  it("parses model references", () => {
    const bp = `
      model ParentItem {
        reference itemNoAction { to ReferencedItem1 }
        reference itemCascade { to ReferencedItem2, on delete cascade }
        reference itemSetNull { to ReferencedItem3, nullable, on delete set null }
      }
      model ReferencedItem1 {
        relation parent { from ParentItem, through itemNoAction }
      }
      model ReferencedItem2 {
        relation parent { from ParentItem, through itemCascade }
      }
      model ReferencedItem3 {
        relation parent { from ParentItem, through itemSetNull }
      }
    `;
    const def = compileFromString(bp);
    expect(def.models).toMatchSnapshot();
  });
});

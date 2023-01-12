import { ActionContext } from "@src/runtime/common/action";
import {
  buildChangset,
  fieldsetAccessToPath,
  formatFieldValue,
  getFieldsetProperty,
  setFieldsetProperty,
} from "@src/runtime/common/changeset";
import { Vars } from "@src/runtime/server/vars";
import { ChangesetDef } from "@src/types/definition";

describe("runtime", () => {
  describe("changeset", () => {
    it("build action changeset object", () => {
      const data: ChangesetDef = [
        {
          name: "value_prop",
          setter: { kind: "literal", value: "just value", type: "text" },
        },
        {
          name: "input_prop",
          setter: {
            fieldsetAccess: ["input_prop"],
            kind: "fieldset-input",
            type: "text",
            required: true,
          },
        },
        {
          name: "input_prop_missing",
          setter: {
            fieldsetAccess: ["__missing__"],
            kind: "fieldset-input",
            type: "text",
            required: false,
          },
        },
      ];

      const context: ActionContext = {
        input: {
          input_prop: "input value",
        },
        vars: new Vars(),
      };

      expect(buildChangset(data, context)).toMatchSnapshot();
    });
  });

  describe("transformations", () => {
    it("create property path from fieldset access", () => {
      expect(fieldsetAccessToPath([])).toEqual("");
      expect(fieldsetAccessToPath(["a", "b", "c"])).toEqual("a.b.c");
      expect(fieldsetAccessToPath(["a", "b", "0", "c"])).toEqual("a.b.0.c");
    });

    it("get object property from path", () => {
      const target = { a: { b: [{ c: 3 }], b1: 2 } };

      expect(getFieldsetProperty(target, ["a", "b", "0", "c"])).toEqual(3);
    });

    it("set object property to path", () => {
      const target = { a: { b: [{ c: 3 }] } };

      expect(setFieldsetProperty(target, ["a", "b", "0", "c"], 3)).toEqual({
        a: { b: [{ c: 3 }] },
      });
    });
  });

  describe("formatting", () => {
    it("ignores undefined/null vlaue", () => {
      expect(formatFieldValue(undefined, "text")).toStrictEqual(undefined);
      expect(formatFieldValue(null, "text")).toStrictEqual(null);
    });

    it("formats text field values", () => {
      expect(formatFieldValue("asdf", "text")).toStrictEqual("asdf");
      expect(formatFieldValue(123, "text")).toStrictEqual("123");
      expect(formatFieldValue([1, 2, 3], "text")).toStrictEqual("1,2,3");
      expect(formatFieldValue({ a: 1 }, "text")).toStrictEqual("[object Object]");
    });

    it("formats integer field values", () => {
      expect(formatFieldValue(123, "integer")).toStrictEqual(123);
      expect(formatFieldValue("asdf", "integer")).toStrictEqual(0);
      expect(formatFieldValue([1, 2, 3], "integer")).toStrictEqual(0);
      expect(formatFieldValue({ a: 1 }, "integer")).toStrictEqual(0);
    });

    it("formats boolean field values", () => {
      expect(formatFieldValue(true, "boolean")).toStrictEqual(true);
      expect(formatFieldValue("true", "boolean")).toStrictEqual(true);
      expect(formatFieldValue("TruE", "boolean")).toStrictEqual(true);
      expect(formatFieldValue("asdf", "boolean")).toStrictEqual(false);
      expect(formatFieldValue(false, "boolean")).toStrictEqual(false);
      expect(formatFieldValue("false", "boolean")).toStrictEqual(false);
      expect(formatFieldValue([1, 2, 3], "boolean")).toStrictEqual(false);
      expect(formatFieldValue({ a: 1 }, "boolean")).toStrictEqual(false);
    });
  });
});

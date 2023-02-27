import { compose } from "@src/composer/composer";
import { getTypedLiteralValue } from "@src/composer/utils";
import { ActionContext } from "@src/runtime/common/action";
import {
  buildChangeset,
  buildStrictChangeset,
  fieldsetAccessToPath,
  formatFieldValue,
  getFieldsetProperty,
  setFieldsetProperty,
} from "@src/runtime/common/changeset";
import { mockQueryExecutor } from "@src/runtime/common/testUtils";
import { Vars } from "@src/runtime/server/vars";
import {
  ChangesetDef,
  Definition,
  FieldSetter,
  FieldSetterChangesetReference,
  FieldSetterFunction,
  FunctionName,
} from "@src/types/definition";

describe("runtime", () => {
  describe("changeset", () => {
    it("build action changeset object", async () => {
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
        {
          name: "virtual_input_prop",
          setter: {
            fieldsetAccess: ["virtual_input_prop"],
            kind: "fieldset-virtual-input",
            type: "text",
            required: false,
            nullable: false,
            validators: [],
          },
        },
        {
          name: "input_value_copy",
          setter: {
            kind: "changeset-reference",
            referenceName: "input_prop",
          },
        },
        {
          name: "other_model",
          setter: {
            kind: "fieldset-reference-input",
            throughRefKey: "OtherModel.slug",
            fieldsetAccess: ["slug"],
          },
        },
        {
          name: "hook_field",
          setter: {
            kind: "fieldset-hook",
            args: [
              { name: "x", setter: { kind: "literal", type: "integer", value: 6 } },
              { name: "y", setter: { kind: "literal", type: "integer", value: 2 } },
            ],
            hook: {
              runtimeName: "TestRuntime",
              code: {
                kind: "inline",
                inline: "x / y",
              },
            },
          },
        },
      ];

      const context: ActionContext = {
        input: {
          input_prop: "input value",
          virtual_input_prop: "virtual input value",
        },
        vars: new Vars(),
        referenceIds: [{ fieldsetAccess: ["slug"], value: 1 }],
      };

      expect(
        await buildChangeset(createTestDefinition(), mockQueryExecutor(), data, context)
      ).toMatchSnapshot();
    });

    it("build strict action changeset object", async () => {
      const data: ChangesetDef = [
        // lept field
        {
          name: "input_prop",
          setter: { kind: "literal", value: "just value", type: "text" },
        },
        // removed virtual/transient fileds
        {
          name: "virtual_input_prop",
          setter: {
            fieldsetAccess: ["virtual_input_prop"],
            kind: "fieldset-virtual-input",
            type: "text",
            required: false,
            nullable: false,
            validators: [],
          },
        },
      ];

      const context: ActionContext = {
        input: {
          input_prop: "input value",
          virtual_input_prop: "virtual input value",
        },
        vars: new Vars(),
        referenceIds: [{ fieldsetAccess: ["slug"], value: 1 }],
      };

      expect(
        await buildStrictChangeset(createTestDefinition(), mockQueryExecutor(), data, context)
      ).toMatchSnapshot();
    });

    it("calculate changeset arithmetic operations", async () => {
      const mkRef = (referenceName: string): FieldSetterChangesetReference => ({
        kind: "changeset-reference",
        referenceName,
      });
      const mkFn = (name: FunctionName, args: FieldSetter[]): FieldSetterFunction => ({
        kind: "function",
        name,
        args,
      });

      const changeset: ChangesetDef = [
        { name: "a", setter: getTypedLiteralValue(2) },

        { name: "foo", setter: getTypedLiteralValue("foo1") },
        { name: "bar", setter: getTypedLiteralValue("bar2") },
        { name: "is_a", setter: getTypedLiteralValue(true) },

        { name: "plus", setter: mkFn("+", [mkRef("a"), getTypedLiteralValue(4)]) },
        { name: "minus", setter: mkFn("-", [mkRef("a"), getTypedLiteralValue(-3)]) },
        { name: "multiply", setter: mkFn("*", [getTypedLiteralValue(6), mkRef("a")]) },
        { name: "divide", setter: mkFn("/", [getTypedLiteralValue(6), mkRef("a")]) },

        { name: "gt", setter: mkFn(">", [mkRef("a"), getTypedLiteralValue(2)]) },
        { name: "gte", setter: mkFn(">=", [mkRef("a"), getTypedLiteralValue(2)]) },
        { name: "lt", setter: mkFn("<", [mkRef("a"), getTypedLiteralValue(2)]) },
        { name: "lte", setter: mkFn("<=", [mkRef("a"), getTypedLiteralValue(2)]) },

        { name: "and", setter: mkFn("and", [mkRef("is_a"), getTypedLiteralValue(false)]) },
        { name: "or", setter: mkFn("or", [mkRef("is_a"), getTypedLiteralValue(false)]) },

        { name: "is", setter: mkFn("is", [mkRef("a"), getTypedLiteralValue(4)]) },
        { name: "is not", setter: mkFn("is not", [mkRef("a"), getTypedLiteralValue(4)]) },

        { name: "in", setter: getTypedLiteralValue("TODO") },
        { name: "not in", setter: getTypedLiteralValue("TODO") },

        {
          name: "concat",
          setter: mkFn("concat", [mkRef("foo"), getTypedLiteralValue(" "), mkRef("bar")]),
        },
        { name: "length", setter: mkFn("length", [mkRef("foo")]) },
        { name: "lower", setter: mkFn("lower", [mkRef("foo")]) },
        { name: "upper", setter: mkFn("upper", [mkRef("foo")]) },
      ];
      const context: ActionContext = {
        input: {},
        vars: new Vars(),
        referenceIds: [],
      };
      expect(
        await buildChangeset(createTestDefinition(), mockQueryExecutor(), changeset, context)
      ).toMatchSnapshot();
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
      expect(formatFieldValue(undefined, "null")).toStrictEqual(undefined);
      expect(formatFieldValue(null, "null")).toStrictEqual(null);
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

/**
 * Creates dummy definition struct
 */
function createTestDefinition(): Definition {
  const def = compose({
    entrypoints: [],
    models: [],
    populators: [],
    runtimes: [
      {
        name: "TestRuntime",
        sourcePath: "./src/runtime/test/hooks",
      },
    ],
  });

  return def;
}

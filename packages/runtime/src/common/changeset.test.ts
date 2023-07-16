import crypto from "crypto";

import bcrypt, { hash } from "bcrypt";

import { ActionContext } from "@runtime/common/action";
import {
  buildChangeset,
  fieldsetAccessToPath,
  formatFieldValue,
  getFieldsetProperty,
  setFieldsetProperty,
} from "@runtime/common/changeset";
import { compileFromString, mockQueryExecutor } from "@runtime/common/testUtils";
import { Vars } from "@runtime/server/vars";
import {
  ChangesetDef,
  Definition,
  FieldSetter,
  FieldSetterChangesetReference,
  FieldSetterFunction,
  FunctionName,
} from "@gaudi/compiler/dist/types/definition";

describe("runtime", () => {
  describe("changeset", () => {
    // mock Date to prevent changing snaps on each run
    const originalBcryptHash = hash;

    beforeAll(() => {
      // mock `Date.now`
      const fixedTimestamp = 1677513237728;
      jest.spyOn(Date, "now").mockImplementation(() => fixedTimestamp);

      // mock `bcrypt.hash`
      const fixedSalt = "$2a$10$rNj8LXd0g..DWYMzvq4DrO"; // this was generated manually by callin `bcrypt.getSaltSync(10)`
      jest.spyOn(bcrypt, "hash").mockImplementation(async (pass, _salt) => {
        // call with fixed mock to get consistent results
        return await originalBcryptHash(pass, fixedSalt);
      });

      // mock `crypto.randomBytes`
      jest.spyOn(crypto, "randomBytes").mockImplementation((size: number) => {
        return "x".repeat(size);
      });
    });
    afterAll(() => {
      jest.restoreAllMocks();
    });

    it("build action changeset object", async () => {
      const data: ChangesetDef = [
        {
          name: "value_prop",
          setter: { kind: "literal", literal: { kind: "string", value: "just value" } },
        },
        {
          name: "input_prop",
          setter: {
            fieldsetAccess: ["input_prop"],
            kind: "fieldset-input",
            type: "string",
            required: true,
          },
        },
        {
          name: "input_prop_missing",
          setter: {
            fieldsetAccess: ["__missing__"],
            kind: "fieldset-input",
            type: "string",
            required: false,
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
            through: ["slug"],
            fieldsetAccess: ["other_slug"],
          },
        },
        {
          name: "deep_other_model",
          setter: {
            kind: "fieldset-reference-input",
            through: ["myref", "slug"],
            fieldsetAccess: ["other_myref_slug"],
          },
        },
        {
          name: "hook_field",
          setter: {
            kind: "fieldset-hook",
            args: [
              { name: "x", setter: { kind: "literal", literal: { kind: "integer", value: 6 } } },
              { name: "y", setter: { kind: "literal", literal: { kind: "integer", value: 2 } } },
            ],
            hook: { kind: "inline", inline: "x / y" },
          },
        },
      ];

      const context: ActionContext = {
        input: {
          input_prop: "input value",
          extra_input_prop: "extra input value",
        },
        vars: new Vars(),
        referenceIds: [
          { kind: "reference-found", fieldsetAccess: ["other_slug"], value: 1 },
          { kind: "reference-found", fieldsetAccess: ["other_myref_slug"], value: 40 },
        ],
      };

      expect(
        await buildChangeset(createTestDefinition(), mockQueryExecutor(), undefined, data, context)
      ).toMatchSnapshot();
    });

    it("build strict action changeset object", async () => {
      const data: ChangesetDef = [
        // lept field
        {
          name: "input_prop",
          setter: { kind: "literal", literal: { kind: "string", value: "just value" } },
        },
      ];

      const context: ActionContext = {
        input: {
          input_prop: "input value",
          extra_input_prop: "extra input value",
        },
        vars: new Vars(),
        referenceIds: [{ kind: "reference-found", fieldsetAccess: ["slug"], value: 1 }],
      };

      expect(
        await buildChangeset(createTestDefinition(), mockQueryExecutor(), undefined, data, context)
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
        { name: "a", setter: { kind: "literal", literal: { kind: "integer", value: 2 } } },

        { name: "foo", setter: { kind: "literal", literal: { kind: "string", value: "foo1" } } },
        { name: "bar", setter: { kind: "literal", literal: { kind: "string", value: "bar2" } } },
        { name: "is_a", setter: { kind: "literal", literal: { kind: "boolean", value: true } } },

        {
          name: "plus",
          setter: mkFn("+", [
            mkRef("a"),
            { kind: "literal", literal: { kind: "integer", value: 4 } },
          ]),
        },
        {
          name: "minus",
          setter: mkFn("-", [
            mkRef("a"),
            { kind: "literal", literal: { kind: "integer", value: -3 } },
          ]),
        },
        {
          name: "multiply",
          setter: mkFn("*", [
            { kind: "literal", literal: { kind: "integer", value: 6 } },
            mkRef("a"),
          ]),
        },
        {
          name: "divide",
          setter: mkFn("/", [
            { kind: "literal", literal: { kind: "integer", value: 6 } },
            mkRef("a"),
          ]),
        },

        {
          name: "gt",
          setter: mkFn(">", [
            mkRef("a"),
            { kind: "literal", literal: { kind: "integer", value: 2 } },
          ]),
        },
        {
          name: "gte",
          setter: mkFn(">=", [
            mkRef("a"),
            { kind: "literal", literal: { kind: "integer", value: 2 } },
          ]),
        },
        {
          name: "lt",
          setter: mkFn("<", [
            mkRef("a"),
            { kind: "literal", literal: { kind: "integer", value: 2 } },
          ]),
        },
        {
          name: "lte",
          setter: mkFn("<=", [
            mkRef("a"),
            { kind: "literal", literal: { kind: "integer", value: 2 } },
          ]),
        },

        {
          name: "and",
          setter: mkFn("and", [
            mkRef("is_a"),
            { kind: "literal", literal: { kind: "boolean", value: false } },
          ]),
        },
        {
          name: "or",
          setter: mkFn("or", [
            mkRef("is_a"),
            { kind: "literal", literal: { kind: "boolean", value: false } },
          ]),
        },

        {
          name: "is",
          setter: mkFn("is", [
            mkRef("a"),
            { kind: "literal", literal: { kind: "integer", value: 4 } },
          ]),
        },
        {
          name: "is not",
          setter: mkFn("is not", [
            mkRef("a"),
            { kind: "literal", literal: { kind: "integer", value: 4 } },
          ]),
        },

        { name: "in", setter: { kind: "literal", literal: { kind: "string", value: "TODO" } } },
        { name: "not in", setter: { kind: "literal", literal: { kind: "string", value: "TODO" } } },

        {
          name: "concat",
          setter: mkFn("concat", [
            mkRef("foo"),
            { kind: "literal", literal: { kind: "string", value: " " } },
            mkRef("bar"),
          ]),
        },
        { name: "length", setter: mkFn("length", [mkRef("foo")]) },
        { name: "lower", setter: mkFn("lower", [mkRef("foo")]) },
        { name: "upper", setter: mkFn("upper", [mkRef("foo")]) },
        { name: "now", setter: mkFn("now", []) },
        {
          name: "stringify",
          setter: mkFn("stringify", [
            { kind: "literal", literal: { kind: "integer", value: 1234 } },
          ]),
        },
        {
          name: "cryptoHash",
          setter: mkFn("cryptoHash", [
            { kind: "literal", literal: { kind: "string", value: "1234567890" } },
            { kind: "literal", literal: { kind: "integer", value: 10 } },
          ]),
        },
        {
          name: "cryptoCompare",
          setter: mkFn("cryptoCompare", [
            { kind: "literal", literal: { kind: "string", value: "1234567890" } },
            {
              kind: "literal",
              literal: {
                kind: "string",
                value: "$2b$10$yvIRy64TPxhnvXWcV0IReeFux.3uDoiR/H5bu5YsEqIkGroqk7To.",
              },
            },
          ]),
        },
        // invalid password
        {
          name: "cryptoCompareFailed",
          setter: mkFn("cryptoCompare", [
            { kind: "literal", literal: { kind: "string", value: "1234567890" } },
            { kind: "literal", literal: { kind: "string", value: "invalid hash" } },
          ]),
        },
        {
          name: "cryptoToken",
          setter: mkFn("cryptoToken", [
            { kind: "literal", literal: { kind: "integer", value: 32 } },
          ]),
        },
      ];
      const context: ActionContext = {
        input: {},
        vars: new Vars(),
        referenceIds: [],
      };
      expect(
        await buildChangeset(
          createTestDefinition(),
          mockQueryExecutor(),
          undefined,
          changeset,
          context
        )
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
      expect(formatFieldValue(undefined, "string")).toStrictEqual(undefined);
      expect(formatFieldValue(null, "string")).toStrictEqual(null);
      expect(formatFieldValue(undefined, "null")).toStrictEqual(undefined);
      expect(formatFieldValue(null, "null")).toStrictEqual(null);
    });

    it("formats text field values", () => {
      expect(formatFieldValue("asdf", "string")).toStrictEqual("asdf");
      expect(formatFieldValue(123, "string")).toStrictEqual("123");
      expect(formatFieldValue([1, 2, 3], "string")).toStrictEqual("1,2,3");
      expect(formatFieldValue({ a: 1 }, "string")).toStrictEqual("[object Object]");
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
  return compileFromString("");
}
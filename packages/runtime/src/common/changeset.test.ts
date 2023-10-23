import crypto from "crypto";

import {
  ChangesetDef,
  ChangesetOperationDef,
  Definition,
  FunctionName,
  LiteralValueDef,
  TypedExprDef,
  TypedFunction,
} from "@gaudi/compiler/dist/types/definition";
import bcrypt, { hash } from "bcrypt";
import _ from "lodash";

import {
  buildChangeset,
  fieldsetAccessToPath,
  formatFieldValue,
  getFieldsetProperty,
  setFieldsetProperty,
} from "@runtime/common/changeset";
import { compileFromString, mockQueryExecutor } from "@runtime/common/testUtils";
import { Storage } from "@runtime/server/context";

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
      const changeset: ChangesetDef = [
        {
          kind: "basic",
          name: "value_prop",
          setter: { kind: "literal", literal: { kind: "string", value: "just value" } },
        },
        {
          kind: "input",
          name: "input_prop",
          setter: {
            kind: "alias-reference",
            source: "fieldset",
            path: ["input_prop"],
          },
          fieldsetPath: ["input_prop"],
          validate: undefined,
        },
        {
          kind: "input",
          name: "input_prop_missing",
          setter: {
            kind: "alias-reference",
            source: "fieldset",
            path: ["__missing__"],
          },
          fieldsetPath: ["__missing__"],
          validate: undefined,
        },
        {
          kind: "basic",
          name: "input_value_copy",
          setter: {
            kind: "identifier-path",
            namePath: ["input_prop"],
          },
        },
        {
          kind: "reference-through",
          name: "other_model",
          setter: {
            kind: "alias-reference",
            source: "referenceThroughs",
            path: ["other_slug", "id"],
          },
          fieldsetPath: ["other_slug"],
          through: ["other_slug"],
        },
        {
          kind: "reference-through",
          name: "deep_other_model",
          setter: {
            kind: "alias-reference",
            source: "referenceThroughs",
            path: ["other_myref_slug", "id"],
          },
          fieldsetPath: ["other_myref_slug"],
          through: ["myref", "slug"],
        },
        {
          kind: "basic",
          name: "hook_field",
          setter: {
            kind: "hook",
            hook: {
              args: [
                {
                  kind: "basic",
                  name: "x",
                  setter: { kind: "literal", literal: { kind: "integer", value: 6 } },
                },
                {
                  kind: "basic",
                  name: "y",
                  setter: { kind: "literal", literal: { kind: "integer", value: 2 } },
                },
              ],
              hook: { kind: "inline", inline: "x / y" },
            },
          },
        },
      ];

      const input = {
        input_prop: "input value",
        extra_input_prop: "extra input value",
        other_slug: "slug-1",
        other_myref_slug: "slug-40",
      };
      const requestContext = new Storage({
        fieldset: input,
        validatedFieldset: input,
        referenceThroughs: {
          other_slug: { id: 1 },
          other_myref_slug: { id: 40 },
        },
      }) as any;

      expect(
        await buildChangeset(createTestDefinition(), mockQueryExecutor(), requestContext, changeset)
      ).toMatchSnapshot();
    });

    it("passes default values correctly", async () => {
      function makeOp(name: string, required: boolean, hasDefault: boolean): ChangesetOperationDef {
        return {
          kind: "input",
          name,
          fieldsetPath: [name],
          validate: undefined,
          setter: {
            kind: "function",
            name: "coalesce",
            args: _.compact([
              { kind: "alias-reference", source: "fieldset", path: [name] },
              hasDefault
                ? {
                    kind: "literal",
                    literal: { kind: "string", value: "this is default value" },
                  }
                : undefined,
            ]),
          },
        };
      }

      /**
       * NOTE: while this test checks the current implementation,
       * it doesn't make sense that 'required' fields have a 'default'
       */

      const changeset: ChangesetDef = [
        makeOp("required_default_provided", true, true),
        makeOp("required_default_missing", true, true),
        makeOp("optional_default_provided", false, true),
        makeOp("optional_default_missing", false, true),
        makeOp("required_no_default", true, false),
        makeOp("optional_no_default", false, false),
      ];

      const input = {
        required_default_provided: "this is user value",
        optional_default_provided: "this is another user value",
      };
      const requestContext = new Storage({ fieldset: input, validatedFieldset: input }) as any;

      expect(
        await buildChangeset(createTestDefinition(), mockQueryExecutor(), requestContext, changeset)
      ).toMatchSnapshot();
    });

    it("calculate changeset arithmetic operations", async () => {
      const mkRef = (name: string): TypedExprDef => ({
        kind: "identifier-path",
        namePath: [name],
      });
      const mkFn = (name: FunctionName, args: TypedExprDef[]): TypedFunction => ({
        kind: "function",
        name,
        args,
      });
      const mkLiteral = (kind: "string" | "integer" | "boolean", value: any): LiteralValueDef => ({
        kind: "literal",
        literal: { kind, value },
      });

      const changeset: ChangesetDef = [
        { kind: "basic", name: "a", setter: mkLiteral("integer", 2) },
        { kind: "basic", name: "foo", setter: mkLiteral("string", "foo1") },
        { kind: "basic", name: "bar", setter: mkLiteral("string", "bar2") },
        { kind: "basic", name: "is_a", setter: mkLiteral("boolean", true) },

        {
          kind: "basic",
          name: "plus",
          setter: mkFn("+", [
            mkRef("a"),
            { kind: "literal", literal: { kind: "integer", value: 4 } },
          ]),
        },
        {
          kind: "basic",
          name: "minus",
          setter: mkFn("-", [
            mkRef("a"),
            { kind: "literal", literal: { kind: "integer", value: -3 } },
          ]),
        },
        {
          kind: "basic",
          name: "multiply",
          setter: mkFn("*", [
            { kind: "literal", literal: { kind: "integer", value: 6 } },
            mkRef("a"),
          ]),
        },
        {
          kind: "basic",
          name: "divide",
          setter: mkFn("/", [
            { kind: "literal", literal: { kind: "integer", value: 6 } },
            mkRef("a"),
          ]),
        },
        {
          kind: "basic",
          name: "gt",
          setter: mkFn(">", [
            mkRef("a"),
            { kind: "literal", literal: { kind: "integer", value: 2 } },
          ]),
        },
        {
          kind: "basic",
          name: "gte",
          setter: mkFn(">=", [
            mkRef("a"),
            { kind: "literal", literal: { kind: "integer", value: 2 } },
          ]),
        },
        {
          kind: "basic",
          name: "lt",
          setter: mkFn("<", [
            mkRef("a"),
            { kind: "literal", literal: { kind: "integer", value: 2 } },
          ]),
        },
        {
          kind: "basic",
          name: "lte",
          setter: mkFn("<=", [
            mkRef("a"),
            { kind: "literal", literal: { kind: "integer", value: 2 } },
          ]),
        },
        {
          kind: "basic",
          name: "and",
          setter: mkFn("and", [
            mkRef("is_a"),
            { kind: "literal", literal: { kind: "boolean", value: false } },
          ]),
        },
        {
          kind: "basic",
          name: "or",
          setter: mkFn("or", [
            mkRef("is_a"),
            { kind: "literal", literal: { kind: "boolean", value: false } },
          ]),
        },
        {
          kind: "basic",
          name: "is",
          setter: mkFn("is", [
            mkRef("a"),
            { kind: "literal", literal: { kind: "integer", value: 4 } },
          ]),
        },
        {
          kind: "basic",
          name: "is not",
          setter: mkFn("is not", [
            mkRef("a"),
            { kind: "literal", literal: { kind: "integer", value: 4 } },
          ]),
        },
        {
          kind: "basic",
          name: "in",
          setter: { kind: "literal", literal: { kind: "string", value: "TODO" } },
        },
        {
          kind: "basic",
          name: "not in",
          setter: { kind: "literal", literal: { kind: "string", value: "TODO" } },
        },
        {
          kind: "basic",
          name: "concat",
          setter: mkFn("concat", [
            mkRef("foo"),
            { kind: "literal", literal: { kind: "string", value: " " } },
            mkRef("bar"),
          ]),
        },
        { kind: "basic", name: "length", setter: mkFn("length", [mkRef("foo")]) },
        { kind: "basic", name: "lower", setter: mkFn("lower", [mkRef("foo")]) },
        { kind: "basic", name: "upper", setter: mkFn("upper", [mkRef("foo")]) },
        { kind: "basic", name: "now", setter: mkFn("now", []) },
        {
          kind: "basic",
          name: "stringify",
          setter: mkFn("stringify", [
            { kind: "literal", literal: { kind: "integer", value: 1234 } },
          ]),
        },
        {
          kind: "basic",
          name: "cryptoHash",
          setter: mkFn("cryptoHash", [
            { kind: "literal", literal: { kind: "string", value: "1234567890" } },
            { kind: "literal", literal: { kind: "integer", value: 10 } },
          ]),
        },
        {
          kind: "basic",
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
          kind: "basic",
          name: "cryptoCompareFailed",
          setter: mkFn("cryptoCompare", [
            { kind: "literal", literal: { kind: "string", value: "1234567890" } },
            { kind: "literal", literal: { kind: "string", value: "invalid hash" } },
          ]),
        },
        {
          kind: "basic",
          name: "cryptoToken",
          setter: mkFn("cryptoToken", [
            { kind: "literal", literal: { kind: "integer", value: 32 } },
          ]),
        },
      ];

      expect(
        await buildChangeset(
          createTestDefinition(),
          mockQueryExecutor(),
          new Storage({ fieldset: {}, validatedFieldset: {} }) as any,
          changeset
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

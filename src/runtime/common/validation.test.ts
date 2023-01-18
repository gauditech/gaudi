import {
  buildFieldsetValidationSchema,
  validateEndpointFieldset,
} from "@src/runtime/common/validation";
import { BusinessError } from "@src/runtime/server/error";
import { FieldsetDef } from "@src/types/definition";

describe("runtime", () => {
  describe("validation", () => {
    it("build fieldset validation schema", () => {
      const fieldset: FieldsetDef = {
        kind: "record",
        nullable: false, // required record
        record: {
          optional: {
            kind: "field",
            nullable: false,
            required: false, // optional field
            type: "integer", // integer field
            validators: [],
          },
          nullable: {
            kind: "field",
            nullable: true, // nullable field
            required: true,
            type: "text",
            validators: [],
          },
          required: {
            kind: "field",
            nullable: false, // required field
            required: true,
            type: "text", // text field
            validators: [],
          },
          something: {
            kind: "field",
            nullable: false,
            required: true,
            type: "boolean", // boolean field
            validators: [],
          },
          subrecord: {
            // subrecord
            kind: "record",
            nullable: false, // optional record
            record: {
              prop: {
                kind: "field",
                nullable: false,
                required: true,
                type: "text",
                validators: [],
              },
            },
          },

          // validators

          integerProp: {
            kind: "field",
            nullable: false,
            required: true,
            type: "integer",
            validators: [
              {
                args: [
                  {
                    type: "integer",
                    value: 0,
                  },
                ],
                inputType: "integer",
                name: "min",
              },
              {
                args: [
                  {
                    type: "integer",
                    value: 9999,
                  },
                ],
                inputType: "integer",
                name: "max",
              },
              {
                args: [
                  {
                    type: "integer",
                    value: 123,
                  },
                ],
                inputType: "integer",
                name: "isIntEqual",
              },
            ],
          },
          textProp: {
            kind: "field",
            nullable: false,
            required: true,
            type: "text",
            validators: [
              {
                args: [
                  {
                    type: "integer",
                    value: 4,
                  },
                ],
                inputType: "text",
                name: "minLength",
              },
              {
                args: [
                  {
                    type: "integer",
                    value: 100,
                  },
                ],
                inputType: "text",
                name: "maxLength",
              },
              {
                args: [],
                inputType: "text",
                name: "isEmail",
              },
              {
                args: [
                  {
                    type: "text",
                    value: "asdf",
                  },
                ],
                inputType: "text",
                name: "isTextEqual",
              },
              {
                args: [],
                inputType: "text",
                name: "isEmail",
              },
            ],
          },
          booleanProp: {
            kind: "field",
            nullable: false,
            required: true,
            type: "boolean",
            validators: [
              {
                args: [
                  {
                    type: "boolean",
                    value: true,
                  },
                ],
                inputType: "boolean",
                name: "isBoolEqual",
              },
            ],
          },
        },
      };

      expect(buildFieldsetValidationSchema(fieldset)).toMatchSnapshot();
    });

    // TODO: test validation exceptions (flat, nested?), (input params)

    it("throws validation exception with validation error messages", async () => {
      const fieldset: FieldsetDef = {
        kind: "record",
        nullable: false,
        record: {
          // required field - missing
          prop1: {
            kind: "field",
            nullable: false,
            required: true,
            type: "text",
            validators: [],
          },
          // integer field - invalid
          prop2: {
            kind: "field",
            nullable: false,
            required: true,
            type: "integer",
            validators: [],
          },
          // subrecord
          subrecord: {
            kind: "record",
            nullable: false,
            record: {
              // nested required field - missing
              subprop1: {
                kind: "field",
                nullable: false,
                required: true,
                type: "text",
                validators: [],
              },
            },
          },

          nullable: {
            kind: "field",
            nullable: true, // nullable field
            required: true,
            type: "text",
            validators: [],
          },

          nonNullable: {
            kind: "field",
            nullable: false, // non-nullable field
            required: true,
            type: "text",
            validators: [],
          },

          // validators - only test that at least one validator triggers error
          textProp: {
            kind: "field",
            nullable: false,
            required: true,
            type: "text",
            validators: [
              {
                args: [
                  {
                    type: "integer",
                    value: 4,
                  },
                ],
                inputType: "text",
                name: "maxLength",
              },
            ],
          },
          integerProp: {
            kind: "field",
            nullable: false,
            required: true,
            type: "integer",
            validators: [
              {
                args: [
                  {
                    type: "integer",
                    value: 100,
                  },
                ],
                inputType: "integer",
                name: "max",
              },
            ],
          },
          booleanProp: {
            kind: "field",
            nullable: false,
            required: true,
            type: "boolean",
            validators: [
              {
                args: [
                  {
                    type: "boolean",
                    value: true,
                  },
                ],
                inputType: "boolean",
                name: "isBoolEqual",
              },
            ],
          },
          noReferenceProp: {
            kind: "field",
            nullable: false,
            required: true,
            type: "text",
            validators: [
              {
                name: "noReference",
              },
            ],
          },
        },
      };

      const data: Record<string, unknown> = {
        // missing required field
        // prop1: '',

        // invalid value for integer field
        prop2: "a",

        // missing required nested field
        // subrecord: { subprop1: '' }

        // accept null
        nullable: null,
        // fail for null
        nonNullable: null,

        // failing validators
        textProp: "too long string",
        integerProp: 10001,
        booleanProp: false,
        noReferenceProp: "noReference",
      };

      let thrownError;
      try {
        await validateEndpointFieldset(fieldset, data);
      } catch (err) {
        const endpointError = err as BusinessError;
        thrownError = JSON.stringify({
          code: endpointError.code,
          message: endpointError.message,
          data: endpointError.data,
        });
      }
      expect(thrownError).toMatchSnapshot();
    });
  });
});

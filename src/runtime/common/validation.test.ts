import {
  buildFieldsetValidationSchema,
  validateEndpointFieldset,
} from "@src/runtime/common/validation";
import { BusinessError } from "@src/runtime/server/error";
import { FieldsetDef } from "@src/types/definition";

describe("runtime", () => {
  describe("validation", () => {
    it("build fieldset validation schema", async () => {
      const fieldset: FieldsetDef = {
        kind: "record",
        nullable: true, // required record
        record: {
          optional: {
            kind: "field",
            nullable: true, // optional field
            type: "integer", // integer field
            validators: [],
          },
          required: {
            kind: "field",
            nullable: false, // required field
            type: "text", // text field
            validators: [],
          },
          something: {
            kind: "field",
            nullable: false,
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
                type: "text",
                validators: [],
              },
            },
          },

          // validators

          integerProp: {
            kind: "field",
            nullable: false,
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
            ],
          },
          booleanProp: {
            kind: "field",
            nullable: false,
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
        nullable: true,
        record: {
          // required field - missing
          prop1: {
            kind: "field",
            nullable: false,
            type: "text",
            validators: [],
          },
          // integer field - invalid
          prop2: {
            kind: "field",
            nullable: false,
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
                type: "text",
                validators: [],
              },
            },
          },
          //validators
          textProp: {
            kind: "field",
            nullable: false,
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

      const data: Record<string, unknown> = {
        // missing required field
        // prop1: '',

        // invalid value for integer field
        prop2: "a",

        // missing required nested field
        // subrecord: { subprop1: '' }

        // failing validators
        textProp: "too long string",
        integerProp: 10001,
        booleanProp: false,
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

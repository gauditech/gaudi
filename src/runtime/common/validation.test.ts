import {
  buildFieldsetValidationSchema,
  validateEndpointFieldset,
} from "@src/runtime/common/validation";
import { GaudiBusinessError } from "@src/runtime/server/error";
import { FieldsetDef } from "@src/types/definition";

describe("runtime", () => {
  describe("validation", () => {
    it("validation fieldset", async () => {
      const fieldset: FieldsetDef = {
        kind: "record",
        nullable: true, // required record
        record: {
          optional: {
            kind: "field",
            nullable: true, // optional field
            type: "integer", // integer field
          },
          required: {
            kind: "field",
            nullable: false, // required field
            type: "text", // text field
          },
          something: {
            kind: "field",
            nullable: false,
            type: "boolean", // boolean field
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
              },
            },
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
          },
          // integer field - invalid
          prop2: {
            kind: "field",
            nullable: false,
            type: "integer",
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
              },
            },
          },
        },
      };

      const data: Record<string, unknown> = {
        // missing required field
        // prop1: '',

        // invalid value for integer field
        prop2: "a",

        // missing reuqired nested field
        // prop2: { subprop1: '' }
      };

      let thrownError;
      try {
        await validateEndpointFieldset(fieldset, data);
      } catch (err) {
        const endpointError = err as GaudiBusinessError;
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

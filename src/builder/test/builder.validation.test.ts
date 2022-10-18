import { buildFieldsetValidationSchema } from "@src/runtime/common/validation";
import { FieldsetDef } from "@src/types/definition";

describe("builder", () => {
  describe("validation", () => {
    it("renders fieldset validation schema correctly", async () => {
      const data: FieldsetDef = {
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

      expect(buildFieldsetValidationSchema(data)).toMatchSnapshot();
    });
  });
});

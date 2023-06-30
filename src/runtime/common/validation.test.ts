import { compileFromString } from "@src/runtime/common/testUtils";
import { validateEndpointFieldset } from "@src/runtime/common/validation";
import { BusinessError } from "@src/runtime/server/error";
import { CreateEndpointDef } from "@src/types/definition";

describe("runtime", () => {
  describe("validation", () => {
    it("build fieldset with validation", () => {
      const bp = `
      model Foo {
        field optional { type integer }
        field nullable { type string, nullable }
        field required { type float }
        field something { type boolean }
        reference subrecord { to Bar }
        field integerProp { type integer, validate { minInt(0) and maxInt(9999) and isEqualInt(123) } }
      }
      model Bar {
        field prop { type string }
        relation foo { from Foo, through subrecord }
      }
      api {
        entrypoint Foo {
          create endpoint {
            extra inputs {
              field textProp { type string, validate { minLength(4) and maxLength(100) and isEmail() } }
              field booleanProp { type boolean, validate { isEqualBool(true) } }
            }
          }
        }
      }
      `;
      const fieldset = (
        compileFromString(bp).apis[0].entrypoints[0].endpoints[0] as CreateEndpointDef
      ).fieldset;
      expect(fieldset).toMatchSnapshot();
    });

    // TODO: test validation exceptions (flat, nested?), (input params)

    it("throws validation exception with validation error messages", async () => {
      const bp = `
      model Foo {
        field prop1 { type string }
        field prop2 { type integer }
        reference subrecord { to Bar }
        field nullable { type string, nullable }
        field nonNullable { type string }
        field textProp { type string, validate { maxLength(4) } }
      }
      model Bar {
        field prop { type string }
        relation foo { from Foo, through subrecord }
      }
      api {
        entrypoint Foo {
          create endpoint {
            extra inputs {
              field integerProp { type integer, validate { maxInt(100) } }
              field booleanProp { type boolean, validate { isEqualBool(true) } }
            }
            action {
              create Bar as subrecord {}
              create {
                set subrecord subrecord
              }
            }
          }
        }
      }
      `;
      const definition = compileFromString(bp);
      const fieldset = (definition.apis[0].entrypoints[0].endpoints[0] as CreateEndpointDef)
        .fieldset;

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
      };

      let thrownError;
      try {
        await validateEndpointFieldset(definition, fieldset, data);
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

import {
  EndpointHttpResponseError,
  EndpointResponseErrorBody,
  GaudiBusinessError,
  createEndpointHttpResponseError,
  createGaudiBusinessError,
  createResourceNotFoundGaudiBusinessError,
  createServerErrorEndpointHttpResponseError,
} from "@src/runtime/server/error";

describe("runtime", () => {
  describe("error", () => {
    it("create generic GaudiBusinessError", async () => {
      const code = "code";
      const message = "message";
      const data = { a: 1 };
      const cause = { b: 1 };

      const err = createGaudiBusinessError(code, message, data, cause);

      expect(err).toBeInstanceOf(GaudiBusinessError);
      expect(serializeError(err)).toMatchSnapshot();
    });

    it("create 'resource not found' GaudiBusinessError", async () => {
      const err = createResourceNotFoundGaudiBusinessError();

      expect(err).toBeInstanceOf(GaudiBusinessError);
      expect(serializeError(err)).toMatchSnapshot();
    });

    describe("create generic EndpointHttpResponseError ", () => {
      it("with string response", () => {
        const status = 500;
        const response = "response message2";
        const cause = { b: 1 };

        const err = createEndpointHttpResponseError(status, response, cause);

        expect(err).toBeInstanceOf(EndpointHttpResponseError);
        expect(serializeError(err)).toMatchSnapshot();
      });

      it("with EndpointResponseErrorBody response", () => {
        const status = 500;
        const response: EndpointResponseErrorBody = {
          code: "CODE",
          message: "some message",
          data: { prop: "asdf" },
        };
        const cause = { b: 1 };

        const err = createEndpointHttpResponseError(status, response, cause);

        expect(err).toBeInstanceOf(EndpointHttpResponseError);
        expect(serializeError(err)).toMatchSnapshot();
      });

      it("with GaudiBusinessError error", () => {
        const status = 500;
        const response: EndpointResponseErrorBody = createGaudiBusinessError(
          "CODE",
          "some message",
          {
            prop: "value",
          }
        );
        const cause = { b: 1 };

        const err = createEndpointHttpResponseError(status, response, cause);

        expect(err).toBeInstanceOf(EndpointHttpResponseError);
        expect(serializeError(err)).toMatchSnapshot();
      });
    });

    describe("create SERVER_ERROR EndpointHttpResponseError ", () => {
      it("with message", () => {
        const message = "response message";

        const err = createServerErrorEndpointHttpResponseError(message);

        expect(err).toBeInstanceOf(EndpointHttpResponseError);
        expect(serializeError(err)).toMatchSnapshot();
      });

      it("with cause", () => {
        const cause = { error: "this is the cause" };

        const err = createServerErrorEndpointHttpResponseError(cause);

        expect(err).toBeInstanceOf(EndpointHttpResponseError);
        expect(serializeError(err)).toMatchSnapshot();
      });

      it("with message and cause", () => {
        const message = "some message";
        const cause = { error: "this is the cause" };

        const err = createServerErrorEndpointHttpResponseError(message, cause);

        expect(err).toBeInstanceOf(EndpointHttpResponseError);
        expect(serializeError(err)).toMatchSnapshot();
      });
    });
  });
});

/**
 * In JS Error's "message" property is not enumerable so it doesn't get stringified.
 * This fn creates a new object out of enumerable properties, manually adds message
 * prop and serializes it.
 *
 * This loses object's identity (eg. prototype chain informatiom) but since the point
 * of this is to serialize object to string, it doesn't matter.
 */
function serializeError(error: Error): string {
  if (error == null) return "";

  const newError = { ...error, message: error.message };

  return JSON.stringify(newError);
}

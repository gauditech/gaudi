// ---------- Endpoint responses

import { isString } from "lodash";

// ---------- Errors

// NOTE: do not create errors directly but use one of the factory fns below

/** Gaudi base error. Should be the basis for all other custom errors. */
export class GaudiError extends Error {
  constructor(public readonly message: string) {
    super(message);

    // default "name" is always "Error" so we'll make it more correct
    this.name = this.constructor.name;
  }
}

/**
 * General purpose business error. Use this error to wrap any internal business error.
 *
 * Error constructor mirrors `EndpointResponseErrorBody` struct props and is used for constructing
 * standard Gaudi endpoint response.
 */
export class GaudiBusinessError<T = unknown> extends GaudiError {
  constructor(
    /** Error code */
    public readonly code: string,
    /** Descriptive error message */
    message: string,
    /** Additional error data. (eg. validation errors) */
    public readonly data?: T,
    /** Root error */
    public readonly cause?: unknown
  ) {
    super(message);
  }
}

/**
 * Error used to describe HTTP response iow. response code and response body which will be sent back to the client.
 * Body can be a string message or an `EndpointResponseErrorBody` struct.
 *
 * This error should be used only by HTTP/REST aware code (eg. endpoints).
 */
export class EndpointHttpResponseError extends GaudiError {
  constructor(
    /** Http response status code */
    public readonly status: number,
    message: string,
    /**
     * Response body
     *
     * JS errors need a string message for their constructor so we'll use `response` if it's a string
     * or we'll take `response.message` if it's an object (iow. `EndpointResponseErrorBody`)
     */
    public readonly response: EndpointResponseErrorBody | undefined,
    /** Root error */
    public readonly cause?: unknown
  ) {
    super(message);
  }
}

// ----- Error response body

// --- Error reponse codes
export const ERROR_CODE_SERVER_ERROR = "ERROR_CODE_SERVER_ERROR";
export const ERROR_CODE_RESOURCE_NOT_FOUND = "ERROR_CODE_RESOURCE_NOT_FOUND";
export const ERROR_CODE_VALIDATION = "ERROR_CODE_VALIDATION";

export type EndpointResponseErrorBody = {
  code: string;
  message: string;
  data?: unknown;
};

// ---------- Error factories

/** Overloads interface for factories receiving optional message and/or cause */
export interface CreateWithMessageOrCauseFactory {
  (): EndpointHttpResponseError;
  (cause: unknown): EndpointHttpResponseError;
  (message: string, cause: unknown): EndpointHttpResponseError;
}

// ----- GaudiBusinessError factories

/** Create GaudiBusinessError instance */
export function createGaudiBusinessError<T = unknown>(
  code: string,
  message: string,
  data?: T,
  cause?: unknown
): GaudiBusinessError<T> {
  return new GaudiBusinessError(code, message, data, cause);
}

/** Create ERROR_CODE_RESOURCE_NOT_FOUND instance of GaudiBusinessError */
export const createResourceNotFoundGaudiBusinessError = (): GaudiBusinessError => {
  return new GaudiBusinessError(ERROR_CODE_RESOURCE_NOT_FOUND, "Resource not found");
};

// ----- EndpointHttpResponseError factories

/** Create EndpointHttpResponseError instance */
export function createEndpointHttpResponseError(
  status: number,
  response: string | EndpointResponseErrorBody,
  cause?: unknown
): EndpointHttpResponseError;

export function createEndpointHttpResponseError(
  status: number,
  response: GaudiBusinessError
): EndpointHttpResponseError;

export function createEndpointHttpResponseError(
  status: number,
  response: string | EndpointResponseErrorBody | GaudiBusinessError,
  cause?: unknown
): EndpointHttpResponseError {
  if (isString(response)) {
    return new EndpointHttpResponseError(status, response, undefined, cause);
  } else if (response instanceof GaudiBusinessError) {
    return new EndpointHttpResponseError(
      status,
      response.message,
      { code: response.code, message: response.message, data: response.data },
      response.cause
    );
  } else {
    return new EndpointHttpResponseError(status, response.message, response, cause);
  }
}

/** Create SERVER_ERROR instance of EndpointHttpResponseError */
export const createServerErrorEndpointHttpResponseError: CreateWithMessageOrCauseFactory = (
  message?: unknown,
  cause?: unknown
): EndpointHttpResponseError => {
  const responseMessage = isString(message) ? message : "Server error";
  const responseCause = !isString(message) ? message : cause;

  return createEndpointHttpResponseError(
    500,
    {
      code: ERROR_CODE_SERVER_ERROR,
      message: responseMessage,
    },
    responseCause
  );
};

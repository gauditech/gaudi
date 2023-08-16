// ---------- Endpoint responses

import { initLogger } from "@gaudi/compiler";
import { assertUnreachable } from "@gaudi/compiler/dist/common/utils";
import _ from "lodash";

const logger = initLogger("gaudi:runtime");

//** Error reponse codes  */
export type HTTPErrorCode =
  | "ERROR_CODE_SERVER_ERROR"
  | "ERROR_CODE_RESOURCE_NOT_FOUND"
  | "ERROR_CODE_VALIDATION"
  | "ERROR_CODE_UNAUTHENTICATED"
  | "ERROR_CODE_FORBIDDEN";

//** Response error body */
export type ResponseErrorBody = {
  code: HTTPErrorCode;
  message: string;
  data?: unknown;
};

/**
 * General purpose business error. Use this error to wrap any business error.
 *
 * Error constructor mirrors `ResponseErrorBody` struct props and is used for constructing
 * standard Gaudi endpoint response.
 */
export class BusinessError<T = unknown> extends Error {
  constructor(
    /** Error code */
    public readonly code: HTTPErrorCode,
    /** Descriptive error message */
    message: string,
    /** Additional error data. (eg. validation errors) */
    public readonly data?: T,
    /** Root error */
    public readonly cause?: unknown
  ) {
    super(message);

    // default "name" is always "Error" so we'll make it more correct
    this.name = "BusinessError";
  }
}

/** Error containing HTTP response data (status, body). */
export class HttpResponseError extends Error {
  constructor(public readonly status: number, public readonly body: unknown) {
    super("Gaudi HTTP response error");

    // default "name" is always "Error" so we'll make it more correct
    this.name = "HttpResponseError";
  }
}

export class HookError extends Error {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(public readonly cause: any) {
    super("Hook error");

    // default "name" is always "Error" so we'll make it more correct
    this.name = "HookError";
  }
}

/** Throw error response from given cause */
export function errorResponse(cause: unknown) {
  // business error
  if (cause instanceof BusinessError) {
    const body: ResponseErrorBody = {
      code: cause.code,
      message: cause.message,
      data: cause.data,
    };

    // log business error - currently all logged as "log/info"
    logger.debug(`${body.code}: ${body.message}`, cause.data ?? "");

    if (cause.code === "ERROR_CODE_VALIDATION") {
      throw new HttpResponseError(400, body);
    } else if (cause.code === "ERROR_CODE_RESOURCE_NOT_FOUND") {
      throw new HttpResponseError(404, body);
    } else if (cause.code === "ERROR_CODE_UNAUTHENTICATED") {
      throw new HttpResponseError(401, body);
    } else if (cause.code === "ERROR_CODE_FORBIDDEN") {
      throw new HttpResponseError(403, body);
    } else if (cause.code === "ERROR_CODE_SERVER_ERROR") {
      throw new HttpResponseError(500, body);
    } else {
      assertUnreachable(cause.code);
    }
  }
  // already packed as HTTP response error
  else if (cause instanceof HttpResponseError) {
    throw cause;
  }
  // hook errors
  else if (cause instanceof HookError) {
    const status = cause.cause.status;
    const message = cause.cause.message;

    // throw HTTP response error - only if error contains required props
    if (_.isInteger(status) && message != null) {
      throw new HttpResponseError(status, message);
    }
    // otherwise, just throw server error

    // log just in case
    logger.error(`[ERROR]`, cause);

    throw new HttpResponseError(500, "Server error");
  }
  // --- something unexpected
  else {
    // log just in case
    logger.error(`[ERROR]`, cause);

    throw new HttpResponseError(500, "Server error");
  }
}

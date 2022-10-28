// ---------- Endpoint responses

//** Error reponse codes  */
export type ErrorCode =
  | "ERROR_CODE_SERVER_ERROR"
  | "ERROR_CODE_RESOURCE_NOT_FOUND"
  | "ERROR_CODE_VALIDATION"
  | "ERROR_CODE_UNAUTHORIZED";

//** Response error body */
export type ResponseErrorBody = {
  code: ErrorCode;
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
    public readonly code: ErrorCode,
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
    console.log(`${body.code}: ${body.message}`);

    if (cause.code === "ERROR_CODE_VALIDATION") {
      throw new HttpResponseError(400, body);
    } else if (cause.code === "ERROR_CODE_RESOURCE_NOT_FOUND") {
      throw new HttpResponseError(404, body);
    } else if (cause.code === "ERROR_CODE_UNAUTHORIZED") {
      throw new HttpResponseError(401, body);
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
  // --- something unexpected
  else {
    // log as error
    console.error(`[ERROR]`, cause);

    throw new HttpResponseError(500, "Server error");
  }
}

/** Function that ensures exhaustivness of conditional statements. */
function assertUnreachable(_: never): never {
  throw new Error("Unreachable code detected");
}

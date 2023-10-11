


// ---- imports & declarations

// declare global fetch API as `any` to avoid Typescript typings problems
declare let fetch: any;
declare let Headers: any;


// ----- API client

export type ApiClientOptions = {
  /** Server API path prefix */
  rootPath?: string;
  /**
   * Function that implements HTTP calls and returns it's result.
   *
   * Default implementation depends on the existence of global `fetch` API.
   * That API should be supported in relevant browsers and node v 18+. 
   * If it's not found, default implementation fallbacks to `undefined` 
   * and users must provide their own implementation.
   * See `resolveDefaultRequestFn()` for details
   * 
   * If the default implementation is not sufficient, users are always free to
   * provide their own implementation using HTTP client lib of their choice.
   */
  requestFn?: ApiRequestFn;
  /** Default request headers which are added to all requests. */
  headers?: Record<string, string>
};


export function createClient(options?: ApiClientOptions) {
  const resolvedOptions = options ?? {}

  const internalOptions: ApiClientOptions = {
    rootPath: resolvedOptions.rootPath,
    requestFn: (resolvedOptions.requestFn ?? resolveDefaultRequestFn()),
    headers: { ...(resolvedOptions.headers ?? {}) },
  }

  return {
    api: {
      ...buildApi(internalOptions)
    }
  };
}


function buildApi(options: ApiClientOptions) {

  function buildTodoEntrypoint(options: ApiClientOptions, parentPath: string) {
    // endpoint types
    type GetResp = {
      id: number,
      title: string,
      completed: boolean
    };
    type GetError = "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND";
    type ListResp = GetResp;
    type ListError = "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER";
    type CreateData = { title: string };
    type CreateResp = GetResp;
    type CreateError = "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_VALIDATION";
    type UpdateData = {
      title?: string,
      completed?: boolean
    };
    type UpdateResp = GetResp;
    type UpdateError = "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_VALIDATION";
    type DeleteError = GetError;

    // entrypoint function
    function api(id: number) {
      const baseUrl = `${parentPath}/${id}`;
      return {

      }
    }

    // endpoint functions
    return Object.assign(api,
      {
        get: buildGetManyFn<number, GetResp, GetError>(options, parentPath),
        list: buildListFn<ListResp, ListError>(options, parentPath),
        create: buildCreateFn<CreateData, CreateResp, CreateError>(options, parentPath),
        update: buildUpdateManyFn<number, UpdateData, UpdateResp, UpdateError>(options, parentPath),
        delete: buildDeleteManyFn<number, DeleteError>(options, parentPath)
      }
    )
  }

  return {
    todo: buildTodoEntrypoint(options, "/api/todo")
  }
}




// ----- API types

export type EndpointHttpMethod = "GET" | "POST" | /*"PUT" |*/ "PATCH" | "DELETE";

/** Result of API function call */
export type ApiRequestFnData = {
  /** HTTP status */
  status: number;
  /** HTTP repsonse headers map */
  headers: { [name: string]: string },
  /** Response body data. */
  data?: any;
};

/**
 * Function that performs request call and returns result.
 * This allows for any custom HTTP client (fetch, axios, ...) implementation
 * to be used regardless of environment (node, browser, ...).
 *
 * Return value from this function is wrapped by client in {ApiResponse}
 * structure and returned to the caller.
 *
 * @param url {string} request URL
 * @param init {ApiRequestInit} request details
 * @returns {ApiRequestFnData}
 */
export type ApiRequestFn = (url: string, init: ApiRequestInit) => Promise<ApiRequestFnData>;

/** API request additional parameters. */
export type ApiRequestInit = {
  /** A BodyInit object or null to set request's body. */
  body?: any;
  /** A Headers object, an object literal, or an array of two-item arrays to set request's headers. */
  headers?: [string, string][] | Record<string, string>;
  /** A string to set request's method. */
  method: EndpointHttpMethod;
}

export type ApiRequestBody = any;

export type ApiResponseErrorBody<C extends string, D = unknown> = C extends any
  ? {
    code: C;
    message: string;
    data?: D;
  }
  : never;

export type ApiResponse<D, E extends string> = ApiResponseSuccess<D> | ApiResponseError<E>;

export type ApiResponseSuccess<D> = {
  kind: "success";
  status: number;
  headers: { [name: string]: string },
  data: D;
};

export type ApiResponseError<E extends string> = {
  kind: "error";
  status: number;
  headers: { [name: string]: string },
  error: ApiResponseErrorBody<E>;
};


export type PaginatedListResponse<T> = {
  page: number;
  pageSize: number;
  totalPages: number;
  totalCount: number;
  data: T[];
};

// TODO: add list search/filter parameter
export type PaginatedListData = { pageSize?: number; page?: number };

export type GetApiClientManyFn<ID, R, E extends string> = (
  id: ID,
  options?: Partial<ApiRequestInit>
) => Promise<ApiResponse<R, E>>;

export type GetApiClientOneFn<R, E extends string> = (
  options?: Partial<ApiRequestInit>
) => Promise<ApiResponse<R, E>>;

export type CreateApiClientFn<D extends ApiRequestBody, R, E extends string> = (
  data: D,
  options?: Partial<ApiRequestInit>
) => Promise<ApiResponse<R, E>>;

export type UpdateApiClientManyFn<ID, D, R, E extends string> = (
  id: ID,
  data: D,
  options?: Partial<ApiRequestInit>
) => Promise<ApiResponse<R, E>>;

export type UpdateApiClientOneFn<D, R, E extends string> = (
  data: D,
  options?: Partial<ApiRequestInit>
) => Promise<ApiResponse<R, E>>;

export type ListApiClientFn<R, E extends string> = (
  options?: Partial<ApiRequestInit>
) => Promise<ApiResponse<R[], E>>;

export type PaginatedListApiClientFn<R, E extends string> = (
  data?: PaginatedListData,
  options?: Partial<ApiRequestInit>
) => Promise<ApiResponse<PaginatedListResponse<R>, E>>;

export type DeleteApiClientManyFn<ID, E extends string> = (
  id: ID,
  options?: Partial<ApiRequestInit>
) => Promise<ApiResponse<void, E>>;

export type DeleteApiClientOneFn<E extends string> = (
  options?: Partial<ApiRequestInit>
) => Promise<ApiResponse<void, E>>;

export type CustomOneFetchApiClientManyFn<ID, R, E extends string> = (
  id: ID,
  options?: Partial<ApiRequestInit>
) => Promise<ApiResponse<R, E>>;

export type CustomOneSubmitApiClientManyFn<ID, D, R, E extends string> = (
  id: ID,
  data?: D,
  options?: Partial<ApiRequestInit>
) => Promise<ApiResponse<R, E>>;

export type CustomOneFetchApiClientOneFn<R, E extends string> = (
  options?: Partial<ApiRequestInit>
) => Promise<ApiResponse<R, E>>;

export type CustomOneSubmitApiClientOneFn<D, R, E extends string> = (
  data?: D,
  options?: Partial<ApiRequestInit>
) => Promise<ApiResponse<R, E>>;

export type CustomManyFetchApiClientFn<R, E extends string> = (
  options?: Partial<ApiRequestInit>
) => Promise<ApiResponse<R[], E>>;

export type CustomManySubmitApiClientFn<D, R, E extends string> = (
  data?: D,
  options?: Partial<ApiRequestInit>
) => Promise<ApiResponse<R[], E>>;


// ----- API fn factories

function buildGetManyFn<ID, R, E extends string>(clientOptions: ApiClientOptions, parentPath: string): GetApiClientManyFn<ID, R, E> {
  return async (id, options) => {
    const url = `${clientOptions.rootPath ?? ''}${parentPath}/${id}`;

    return (
      makeRequest(clientOptions, url, {
        method: "GET",
        headers: { ...(options?.headers ?? {}) },
      })
    );
  };
}

function buildGetOneFn<R, E extends string>(clientOptions: ApiClientOptions, parentPath: string): GetApiClientOneFn<R, E> {
  return async (options) => {
    const url = `${clientOptions.rootPath ?? ''}${parentPath}`;

    return (
      makeRequest(clientOptions, url, {
        method: "GET",
        headers: { ...(options?.headers ?? {}) },
      })
    );
  };
}

function buildCreateFn<D extends ApiRequestBody, R, E extends string>(
  clientOptions: ApiClientOptions, parentPath: string
): CreateApiClientFn<D, R, E> {
  return async (data, options) => {
    const url = `${clientOptions.rootPath ?? ''}${parentPath}`;

    return (
      makeRequest(clientOptions, url, {
        method: "POST",
        body: data,
        headers: { ...(options?.headers ?? {}) },
      })
    );
  };
}

function buildUpdateManyFn<ID, D extends ApiRequestBody, R, E extends string>(
  clientOptions: ApiClientOptions, parentPath: string
): UpdateApiClientManyFn<ID, D, R, E> {
  return async (id, data, options) => {
    const url = `${clientOptions.rootPath ?? ''}${parentPath}/${id}`;

    return (
      makeRequest(clientOptions, url, {
        method: "PATCH",
        body: data,
        headers: { ...(options?.headers ?? {}) },
      })
    );
  };
}

function buildUpdateOneFn<D extends ApiRequestBody, R, E extends string>(
  clientOptions: ApiClientOptions, parentPath: string
): UpdateApiClientOneFn<D, R, E> {
  return async (data, options) => {
    const url = `${clientOptions.rootPath ?? ''}${parentPath}`;

    return (
      makeRequest(clientOptions, url, {
        method: "PATCH",
        body: data,
        headers: { ...(options?.headers ?? {}) },
      })
    );
  };
}

function buildDeleteManyFn<ID, E extends string>(clientOptions: ApiClientOptions, parentPath: string): DeleteApiClientManyFn<ID, E> {
  return async (id, options) => {
    const url = `${clientOptions.rootPath ?? ''}${parentPath}/${id}`;

    return (
      makeRequest(clientOptions, url, {
        method: "DELETE",
        headers: { ...(options?.headers ?? {}) },
      })
    );
  };
}

function buildDeleteOneFn<E extends string>(clientOptions: ApiClientOptions, parentPath: string): DeleteApiClientOneFn<E> {
  return async (options) => {
    const url = `${clientOptions.rootPath ?? ''}${parentPath}`;

    return (
      makeRequest(clientOptions, url, {
        method: "DELETE",
        headers: { ...(options?.headers ?? {}) },
      })
    );
  };
}

function buildListFn<R, E extends string>(clientOptions: ApiClientOptions, parentPath: string): ListApiClientFn<R, E> {
  return async (options) => {
    const urlPath = `${clientOptions.rootPath ?? ''}${parentPath}`;

    return (
      makeRequest(clientOptions, urlPath, {
        method: "GET",
        headers: { ...(options?.headers ?? {}) },
      })
    );
  };
}

function buildPaginatedListFn<R, E extends string>(clientOptions: ApiClientOptions, parentPath: string): PaginatedListApiClientFn<R, E> {
  return async (data, options) => {
    const urlPath = `${clientOptions.rootPath ?? ''}${parentPath}`;

    const params = new URLSearchParams()
    Object.entries(data ?? {}).map(([key, value]) => params.set(key, JSON.stringify(value)))
    const urlParams = params.toString()

    const url = urlPath + (urlParams ? '?' + urlParams : '')

    return (
      makeRequest(clientOptions, url, {
        method: "GET",
        headers: { ...(options?.headers ?? {}) },
      })
    );
  };
}

function buildCustomOneFetchManyFn<ID, R, E extends string>(
  clientOptions: ApiClientOptions,
  parentPath: string,
  path: string,
  method: EndpointHttpMethod
): CustomOneFetchApiClientManyFn<ID, R, E> {
  return async (id, options) => {
    const url = `${clientOptions.rootPath ?? ''}${parentPath}/${id}/${path}`;

    return (
      makeRequest(clientOptions, url, {
        method,
        headers: { ...(options?.headers ?? {}) },
      })
    );
  };
}

function buildCustomOneSubmitManyFn<ID, D extends ApiRequestBody, R, E extends string>(
  clientOptions: ApiClientOptions,
  parentPath: string,
  path: string,
  method: EndpointHttpMethod
): CustomOneSubmitApiClientManyFn<ID, D, R, E> {
  return async (id, data, options) => {
    const url = `${clientOptions.rootPath ?? ''}${parentPath}/${id}/${path}`;

    return (
      makeRequest(clientOptions, url, {
        method,
        body: data,
        headers: { ...(options?.headers ?? {}) },
      })
    );
  };
}

function buildCustomOneFetchOneFn<R, E extends string>(
  clientOptions: ApiClientOptions,
  parentPath: string,
  path: string,
  method: EndpointHttpMethod
): CustomOneFetchApiClientOneFn<R, E> {
  return async (options) => {
    const url = `${clientOptions.rootPath ?? ''}${parentPath}/${path}`;

    return (
      makeRequest(clientOptions, url, {
        method,
        headers: { ...(options?.headers ?? {}) },
      })
    );
  };
}

function buildCustomOneSubmitOneFn<D extends ApiRequestBody, R, E extends string>(
  clientOptions: ApiClientOptions,
  parentPath: string,
  path: string,
  method: EndpointHttpMethod
): CustomOneSubmitApiClientOneFn<D, R, E> {
  return async (data, options) => {
    const url = `${clientOptions.rootPath ?? ''}${parentPath}/${path}`;

    return (
      makeRequest(clientOptions, url, {
        method,
        body: data,
        headers: { ...(options?.headers ?? {}) },
      })
    );
  };
}

function buildCustomManyFetchFn<R, E extends string>(
  clientOptions: ApiClientOptions,
  parentPath: string,
  path: string,
  method: EndpointHttpMethod
): CustomManyFetchApiClientFn<R, E> {
  return async (options) => {
    const url = `${clientOptions.rootPath ?? ''}${parentPath}/${path}`;

    return (
      makeRequest(clientOptions, url, {
        method,
        headers: { ...(options?.headers ?? {}) },
      })
    );
  };
}

function buildCustomManySubmitFn<D extends ApiRequestBody, R, E extends string>(
  clientOptions: ApiClientOptions,
  parentPath: string,
  path: string,
  method: EndpointHttpMethod
): CustomManySubmitApiClientFn<D, R, E> {
  return async (data, options) => {
    const url = `${clientOptions.rootPath ?? ''}${parentPath}/${path}`;

    return (
      makeRequest(clientOptions, url, {
        method,
        body: data,
        headers: { ...(options?.headers ?? {}) },
      })
    );
  };
}
async function makeRequest<D, E extends string>(
  clientOptions: ApiClientOptions,
  url: string,
  init: ApiRequestInit
): Promise<ApiResponse<D, E>> {
  if (clientOptions.requestFn == null) {
    throw new Error("Request function is required in API client");
  }

  const reqUrl = url
  const reqInit = {
    ...init,
    headers: {
      ...clientOptions.headers,
      ...(init.headers ?? {})
    }
  }

  return clientOptions.requestFn(reqUrl, reqInit).then(({ status, data, headers = {} }) => {
    if (status >= 200 && status < 300) {
      return {
        kind: "success",
        status,
        headers,
        data,
      };
    } else {
      if (data == null) {
        return {
          kind: "error",
          status,
          headers,
          error: {
            code: "ERROR_CODE_OTHER",
            message: "empty response",
          } as ApiResponseErrorBody<E>,
          // TODO: fix response error type (TS complains about types not overlapping!?)
        };
      }
      else if (typeof data === "string") {
        return {
          kind: "error",
          status,
          headers,
          error: {
            code: "ERROR_CODE_OTHER",
            message: data,
          } as ApiResponseErrorBody<E>,
          // TODO: fix response error type (TS complains about types not overlapping!?)
        };
      } else {
        if ("code" in data && "message" in data) {
          return {
            kind: "error",
            status,
            headers,
            error: data,
          };
        } else {
          return {
            kind: "error",
            status,
            headers,
            error: {
              code: "ERROR_CODE_OTHER",
              message: "Unexpected error",
              data,
            } as ApiResponseErrorBody<E>,
            // TODO: fix response error type (TS complains about types not overlapping!?)
          };
        }
      }
    }
  });
}

/**
 * Create a default request function implementation for API client (see `ApiClientOptions.requestFn`).
 * 
 * Depends on the existence of global `fetch` API.
 * This should exist in all relevant browsers and node versions 18+.
 * 
 * If global `fetch` is not found, it returns `undefined` and user
 * must provide it's own implementation.
 * 
 * Since we make a runtime check for global `fetch` we declare it and other parts
 * of it's API as `any` to avoid unnecessary Typescript typings problems.
 */
function resolveDefaultRequestFn() {
  // no global fetch, no function
  if (fetch === undefined) return;

  return (url: string, init: any) => {
    const method = init.method;
    const headers = new Headers({
      // presume JSON request but allow overriding by `init.headers`
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    })
    // detect JSON request
    const isJsonReq = (headers.get("content-type") ?? "").indexOf("/json") !== -1;
    const body = init.body != null && isJsonReq ? JSON.stringify(init.body) : init.body;

    return (
      // call API
      fetch(url, {
        method,
        body,
        headers,
      })
        // transform to struct required by API client
        .then(async (response: any) => {
          // detect JSON response
          const isJsonResp = (response.headers.get("content-type") ?? "").indexOf("/json") !== -1;

          const status = response.status
          const data = isJsonResp ? await response.json() : await response.text(); // pick response data type
          const headers = Object.fromEntries(response.headers.entries()); // copy headers structure

          return {
            status,
            data,
            headers
          };
        })
    );
  }
}



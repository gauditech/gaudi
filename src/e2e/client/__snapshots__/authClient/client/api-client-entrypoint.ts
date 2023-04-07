
  // ----- API client
  
  export type ApiClientOptions = {
    /** Server API path prefix */
    rootPath?: string;
    /**
     * Function that implements HTTP calls and returns it's result.
     * 
     * This lib does not implement it's own HTTP calls which allows users
     * to use any HTTP client lib of their choice.
     */
    requestFn: ApiRequestFn;
    /** Default request headers which are added to all requests. */
    headers?: Record<string, string>
  };

  export function createClient(options: ApiClientOptions) {
    const internalOptions: ApiClientOptions = {
      rootPath: options.rootPath,
      requestFn: options.requestFn,
      headers: {...(options.headers ?? {})},
    }

    return {
      api: buildApi(internalOptions ?? {}),
    };
  }

  
    function buildApi(options: ApiClientOptions) {
      return {
        authUser: buildAuthuserApi(options, "auth_user"),
box: buildBoxApi(options, "box")
      }
    }

    
  function buildAuthuserApi(options: ApiClientOptions, parentPath: string) {
    // endpoint types
    type LoginError = "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER"|"ERROR_CODE_VALIDATION";
type LogoutError = LoginError;
type RegisterError = LoginError;

    // entrypoint function
    function api(id: number) {
      const baseUrl = `${parentPath}/${id}`;
      return {
        
      }
    }

    // endpoint functions
    return Object.assign(api, 
      {
        login: buildCustomManySubmitFn<any, any, LoginError>(options, parentPath, "login", "POST"),
logout: buildCustomManySubmitFn<any, any, LogoutError>(options, parentPath, "logout", "POST"),
register: buildCustomManySubmitFn<any, any, RegisterError>(options, parentPath, "register", "POST")
      }
    )
  }

  function buildBoxApi(options: ApiClientOptions, parentPath: string) {
    // endpoint types
    type ListResp = { id: number,
name: string,
is_public: boolean,
owner_id: number };
type ListErrot = "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER";
type GetResp = ListResp;
type GetError = ListErrot;
type CreateData = { name: string,
is_public: boolean };
type CreateResp = ListResp;
type CreateError = "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER"|"ERROR_CODE_VALIDATION";
type FetchAuthTokenError = CreateError;

    // entrypoint function
    function api(id: string) {
      const baseUrl = `${parentPath}/${id}`;
      return {
        items: buildItemsApi(options, `${baseUrl}/items`)
      }
    }

    // endpoint functions
    return Object.assign(api, 
      {
        list: buildListFn<ListResp, ListErrot>(options, parentPath),
get: buildGetFn<string, GetResp, GetError>(options, parentPath),
create: buildCreateFn<CreateData,CreateResp, CreateError>(options, parentPath),
fetchAuthToken: buildCustomManySubmitFn<any, any, FetchAuthTokenError>(options, parentPath, "fetchAuthToken", "POST")
      }
    )
  }

  function buildItemsApi(options: ApiClientOptions, parentPath: string) {
    // endpoint types
    type GetResp = { id: number,
name: string,
is_public: boolean,
box_id: number };
type GetError = "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER";

    // entrypoint function
    function api(id: string) {
      const baseUrl = `${parentPath}/${id}`;
      return {
        
      }
    }

    // endpoint functions
    return Object.assign(api, 
      {
        get: buildGetFn<string, GetResp, GetError>(options, parentPath)
      }
    )
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
  
  export type ApiResponse<D, E extends string> = ApiResponseSuccess<D, E> | ApiResponseError<D, E>;

  export type ApiResponseSuccess<D, E extends string> = {
    kind: "success";
    status: number;
    headers: {[name: string]: string},
    data: D;
  };

  export type ApiResponseError<D, E extends string> = {
    kind: "error";
    status: number;
    headers: { [name: string]: string },
    error: ApiResponseErrorBody<E>;
  };

// TODO: add list search/filter parameter
  export type ListData = { pageSize?: number; page?: number };
  
  export type GetApiClientFn<ID, R, E extends string> = (
    id: ID,
    options?: Partial<ApiRequestInit>
  ) => Promise<ApiResponse<R, E>>;
  export type CreateApiClientFn<D extends ApiRequestBody, R, E extends string> = (
    data: D,
    options?: Partial<ApiRequestInit>
  ) => Promise<ApiResponse<R, E>>;
  export type UpdateApiClientFn<ID, D, R, E extends string> = (
    id: ID,
    data: D,
    options?: Partial<ApiRequestInit>
  ) => Promise<ApiResponse<R, E>>;
  export type ListApiClientFn<R, E extends string> = (
    data?: ListData,
    options?: Partial<ApiRequestInit>
  ) => Promise<ApiResponse<R[], E>>;
  export type DeleteApiClientFn<ID, E extends string> = (
    id: ID,
    options?: Partial<ApiRequestInit>
  ) => Promise<ApiResponse<void, E>>;
  
  export type CustomOneFetchApiClientFn<ID, R, E extends string> = (
    id: ID,
    options?: Partial<ApiRequestInit>
  ) => Promise<ApiResponse<R, E>>;
  export type CustomOneSubmitApiClientFn<ID, D, R, E extends string> = (
    id: ID,
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

  function buildGetFn<ID, R, E extends string>(clientOptions: ApiClientOptions, parentPath: string): GetApiClientFn<ID, R, E> {
    return async (id, options) => {
      const url = `${clientOptions.rootPath ?? ''}/${parentPath}/${id}`;

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
      const url = `${clientOptions.rootPath ?? ''}/${parentPath}`;

      return (
        makeRequest(clientOptions, url, {
          method: "POST",
          body: data,
          headers: { ...(options?.headers ?? {}) },
        })
      );
    };
  }
  
  function buildUpdateFn<ID, D extends ApiRequestBody, R, E extends string>(
    clientOptions: ApiClientOptions, parentPath: string
  ): UpdateApiClientFn<ID, D, R, E> {
    return async (id, data, options) => {
      const url = `${clientOptions.rootPath ?? ''}/${parentPath}/${id}`;

      return (
        makeRequest(clientOptions, url, {
          method: "PATCH",
          body: data,
          headers: { ...(options?.headers ?? {}) },
        })
      );
    };
  }
  
  function buildDeleteFn<ID, E extends string>(clientOptions: ApiClientOptions, parentPath: string): DeleteApiClientFn<ID, E> {
    return async (id, options) => {
      const url = `${clientOptions.rootPath ?? ''}/${parentPath}/${id}`;

      return (
        makeRequest(clientOptions, url, {
          method: "DELETE",
          headers: { ...(options?.headers ?? {}) },
        })
      );
    };
  }
  
  function buildListFn<R, E extends string>(clientOptions: ApiClientOptions, parentPath: string): ListApiClientFn<R, E> {
    return async (data, options) => {
      const urlPath = `${clientOptions.rootPath ?? ''}/${parentPath}`;

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
  
  function buildCustomOneFetchFn<ID, R, E extends string>(
    clientOptions: ApiClientOptions,
    parentPath: string,
    path: string,
    method: EndpointHttpMethod
  ): CustomOneFetchApiClientFn<ID, R, E> {
    return async (id, options) => {
      const url = `${clientOptions.rootPath ?? ''}/${parentPath}/${id}/${path}`;

      return (
        makeRequest(clientOptions, url, {
          method,
          headers: { ...(options?.headers ?? {}) },
        })
      );
    };
  }
  
  function buildCustomOneSubmitFn<ID, D extends ApiRequestBody, R, E extends string>(
    clientOptions: ApiClientOptions,
    parentPath: string,
    path: string,
    method: EndpointHttpMethod
  ): CustomOneSubmitApiClientFn<ID, D, R, E> {
    return async (id, data, options) => {
      const url = `${clientOptions.rootPath ?? ''}/${parentPath}/${id}/${path}`;

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
      const url = `${clientOptions.rootPath ?? ''}/${parentPath}/${path}`;
  
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
      const url = `${clientOptions.rootPath ?? ''}/${parentPath}/${path}`;

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

    return clientOptions.requestFn(reqUrl, reqInit).then(({status, data, headers = {} }) => {
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



  
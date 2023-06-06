
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
    api: {
      ...buildApi(internalOptions ?? {})
    }
  };
  }

  
    function buildApi(options: ApiClientOptions) {
      
  function buildOrgEntrypoint(options: ApiClientOptions, parentPath: string) {
    // endpoint types
    type CustomOneActionError = "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER"|"ERROR_CODE_VALIDATION";
type CustomManyActionError = CustomOneActionError;
type CustomOneActionRespondsError = CustomOneActionError;
type CustomManyActionRespondsError = CustomOneActionError;
type CustomOneQueryActionError = CustomOneActionError;
type CustomFetchActionError = CustomOneActionError;
type HookErrorResponseError = CustomOneActionError;
type CustomGetError = "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER";
type CustomUpdateError = CustomOneActionError;
type CustomDeleteError = CustomGetError;
type CustomListError = CustomGetError;
type CustomCreateError = CustomOneActionError;
type GetResp = { name: string,
slug: string,
description: string,
summary: string,
nameAndDesc: unknown,
blank_repos: { id: number,
total_issues: number }[] };
type GetError = CustomGetError;
type ListResp = GetResp;
type ListError = CustomGetError;
type CreateData = { name: string,
slug: string,
description: string };
type CreateResp = GetResp;
type CreateError = CustomOneActionError;
type UpdateData = { name?: string,
slug?: string,
description?: string };
type UpdateResp = GetResp;
type UpdateError = CustomOneActionError;
type DeleteError = CustomGetError;

    // entrypoint function
    function api(id: string) {
      const baseUrl = `${parentPath}/${id}`;
      return {
        repos: buildReposEntrypoint(options, `${baseUrl}/repos`)
      }
    }

    // endpoint functions
    return Object.assign(api,
      {
        customOneAction: buildCustomOneSubmitManyFn<string, any, any, CustomOneActionError>(options, parentPath, "customOneAction", "POST"),
customManyAction: buildCustomManySubmitFn<any, any, CustomManyActionError>(options, parentPath, "customManyAction", "PATCH"),
customOneActionResponds: buildCustomOneSubmitManyFn<string, any, any, CustomOneActionRespondsError>(options, parentPath, "customOneActionResponds", "POST"),
customManyActionResponds: buildCustomManySubmitFn<any, any, CustomManyActionRespondsError>(options, parentPath, "customManyActionResponds", "PATCH"),
customOneQueryAction: buildCustomOneSubmitManyFn<string, any, any, CustomOneQueryActionError>(options, parentPath, "customOneQueryAction", "POST"),
customFetchAction: buildCustomOneSubmitManyFn<string, any, any, CustomFetchActionError>(options, parentPath, "customFetchAction", "POST"),
hookErrorResponse: buildCustomManySubmitFn<any, any, HookErrorResponseError>(options, parentPath, "hookErrorResponse", "POST"),
customGet: buildCustomOneFetchManyFn<string, any, CustomGetError>(options, parentPath, "customGet", "GET"),
customUpdate: buildCustomOneSubmitManyFn<string, any, any, CustomUpdateError>(options, parentPath, "customUpdate", "PATCH"),
customDelete: buildCustomOneFetchManyFn<string, any, CustomDeleteError>(options, parentPath, "customDelete", "DELETE"),
customList: buildCustomManyFetchFn<any, CustomListError>(options, parentPath, "customList", "GET"),
customCreate: buildCustomManySubmitFn<any, any, CustomCreateError>(options, parentPath, "customCreate", "POST"),
get: buildGetManyFn<string, GetResp, GetError>(options, parentPath),
list: buildPaginatedListFn<ListResp, ListError>(options, parentPath),
create: buildCreateFn<CreateData,CreateResp, CreateError>(options, parentPath),
update: buildUpdateManyFn<string, UpdateData,UpdateResp, UpdateError>(options, parentPath),
delete: buildDeleteManyFn<string, DeleteError>(options, parentPath)
      }
    )
  }

  function buildReposEntrypoint(options: ApiClientOptions, parentPath: string) {
    // endpoint types
    type GetResp = { id: number,
slug: string,
description: string,
org_id: number };
type GetError = "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER";
type ListResp = GetResp;
type ListError = GetError;
type CreateData = { raw_description: string,
name: string,
is_public: boolean };
type CreateResp = GetResp;
type CreateError = "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER"|"ERROR_CODE_VALIDATION";
type UpdateData = { name?: string,
slug?: string,
description?: string,
is_public?: boolean,
latest_num?: number,
org_id?: number };
type UpdateResp = GetResp;
type UpdateError = CreateError;
type DeleteError = GetError;

    // entrypoint function
    function api(id: number) {
      const baseUrl = `${parentPath}/${id}`;
      return {
        issues: buildIssuesEntrypoint(options, `${baseUrl}/issues`)
      }
    }

    // endpoint functions
    return Object.assign(api,
      {
        get: buildGetManyFn<number, GetResp, GetError>(options, parentPath),
list: buildListFn<ListResp, ListError>(options, parentPath),
create: buildCreateFn<CreateData,CreateResp, CreateError>(options, parentPath),
update: buildUpdateManyFn<number, UpdateData,UpdateResp, UpdateError>(options, parentPath),
delete: buildDeleteManyFn<number, DeleteError>(options, parentPath)
      }
    )
  }

  function buildIssuesEntrypoint(options: ApiClientOptions, parentPath: string) {
    // endpoint types
    type GetResp = { id: number,
title: string,
repo: { id: number,
name: string,
slug: string,
description: string,
is_public: boolean,
latest_num: number,
org_id: number },
number: number,
comments: { id: number,
body: string,
issue_id: number }[] };
type GetError = "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER";
type CreateData = { title: string,
repo2: { name?: string,
slug?: string,
description?: string,
is_public?: boolean,
org_id?: number },
c: { body: string } };
type CreateResp = GetResp;
type CreateError = "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER"|"ERROR_CODE_VALIDATION";

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
create: buildCreateFn<CreateData,CreateResp, CreateError>(options, parentPath)
      }
    )
  }

  function buildRepoEntrypoint(options: ApiClientOptions, parentPath: string) {
    // endpoint types
    type ListResp = { id: number,
slug: string,
description: string,
org_id: number };
type ListError = "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER";
type GetResp = ListResp;
type GetError = ListError;

    // entrypoint function
    function api(id: number) {
      const baseUrl = `${parentPath}/${id}`;
      return {
        
      }
    }

    // endpoint functions
    return Object.assign(api,
      {
        list: buildListFn<ListResp, ListError>(options, parentPath),
get: buildGetManyFn<number, GetResp, GetError>(options, parentPath)
      }
    )
  }

      return {
        org: buildOrgEntrypoint(options, "/api/org"),
repo: buildRepoEntrypoint(options, "/api/repo")
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



  
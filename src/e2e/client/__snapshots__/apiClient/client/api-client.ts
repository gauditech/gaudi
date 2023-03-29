
  // ----- API client
  
  export type ApiClientOptions = {
    rootPath?: string;
    requestFn: ApiRequestFn;
  };

  export function createClient(options: ApiClientOptions) {
    return {
      api: buildApi(options ?? {}),
    };
  }

  
    function buildApi(options: ApiClientOptions) {
      return {
        org: buildOrgApi(options, "org")
      }
    }

    
  function buildOrgApi(options: ApiClientOptions, parentPath: string) {
    type GetResp = { name: string,
slug: string,
description: string,
summary: unknown,
nameAndDesc: unknown };
type ListResp = { name: string,
slug: string,
description: string,
summary: unknown,
nameAndDesc: unknown };
type CreateData = { name: string,
slug: string,
description: string };
type CreateResp = { name: string,
slug: string,
description: string,
summary: unknown,
nameAndDesc: unknown };
type UpdateData = { name?: string,
slug?: string,
description?: string };
type UpdateResp = { name: string,
slug: string,
description: string,
summary: unknown,
nameAndDesc: unknown };

    function api(id: string) {
      const baseUrl = `${parentPath}/${id}`;
      return {
        repos: buildReposApi(options, `${baseUrl}/repos`)
      }
    }

    return Object.assign(api, 
      {
        customOneAction: buildCustomOneSubmitFn<string, any, any, "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER"|"ERROR_CODE_VALIDATION">(options, parentPath, "customOneAction", "POST"),
customManyAction: buildCustomManySubmitFn<any, any, "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER"|"ERROR_CODE_VALIDATION">(options, parentPath, "customManyAction", "PATCH"),
customOneActionResponds: buildCustomOneSubmitFn<string, any, any, "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER"|"ERROR_CODE_VALIDATION">(options, parentPath, "customOneActionResponds", "POST"),
customManyActionResponds: buildCustomManySubmitFn<any, any, "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER"|"ERROR_CODE_VALIDATION">(options, parentPath, "customManyActionResponds", "PATCH"),
customOneQueryAction: buildCustomOneSubmitFn<string, any, any, "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER"|"ERROR_CODE_VALIDATION">(options, parentPath, "customOneQueryAction", "POST"),
customFetchAction: buildCustomOneSubmitFn<string, any, any, "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER"|"ERROR_CODE_VALIDATION">(options, parentPath, "customFetchAction", "POST"),
hookErrorResponse: buildCustomManySubmitFn<any, any, "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER"|"ERROR_CODE_VALIDATION">(options, parentPath, "hookErrorResponse", "POST"),
customGet: buildCustomOneFetchFn<string, any, "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER">(options, parentPath, "customGet", "GET"),
customUpdate: buildCustomOneSubmitFn<string, any, any, "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER"|"ERROR_CODE_VALIDATION">(options, parentPath, "customUpdate", "PATCH"),
customDelete: buildCustomOneFetchFn<string, any, "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER">(options, parentPath, "customDelete", "DELETE"),
customList: buildCustomManyFetchFn<any, "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER">(options, parentPath, "customList", "GET"),
customCreate: buildCustomManySubmitFn<any, any, "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER"|"ERROR_CODE_VALIDATION">(options, parentPath, "customCreate", "POST"),
get: buildGetFn<string, GetResp, "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER">(options, parentPath),
list: buildListFn<ListResp, "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER">(options, parentPath),
create: buildCreateFn<CreateData,CreateResp, "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER"|"ERROR_CODE_VALIDATION">(options, parentPath),
update: buildUpdateFn<string, UpdateData,UpdateResp, "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER"|"ERROR_CODE_VALIDATION">(options, parentPath),
delete: buildDeleteFn<string, "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER">(options, parentPath)
      }
    )
  }

  function buildReposApi(options: ApiClientOptions, parentPath: string) {
    type GetResp = { id: number,
slug: string,
description: string,
org_id: number };
type ListResp = { id: number,
slug: string,
description: string,
org_id: number };
type CreateData = { raw_description: string,
name: string,
is_public: boolean };
type CreateResp = { id: number,
slug: string,
description: string,
org_id: number };
type UpdateData = { name?: string,
slug?: string,
description?: string,
is_public?: boolean,
latest_num?: number,
org_id?: number };
type UpdateResp = { id: number,
slug: string,
description: string,
org_id: number };

    function api(id: number) {
      const baseUrl = `${parentPath}/${id}`;
      return {
        issues: buildIssuesApi(options, `${baseUrl}/issues`)
      }
    }

    return Object.assign(api, 
      {
        get: buildGetFn<number, GetResp, "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER">(options, parentPath),
list: buildListFn<ListResp, "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER">(options, parentPath),
create: buildCreateFn<CreateData,CreateResp, "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER"|"ERROR_CODE_VALIDATION">(options, parentPath),
update: buildUpdateFn<number, UpdateData,UpdateResp, "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER"|"ERROR_CODE_VALIDATION">(options, parentPath),
delete: buildDeleteFn<number, "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER">(options, parentPath)
      }
    )
  }

  function buildIssuesApi(options: ApiClientOptions, parentPath: string) {
    type GetResp = { id: number,
title: string,
repo: { id: number,
name: string,
slug: string,
description: string,
is_public: boolean,
latest_num: number,
org_id: number },
number: string,
comments: { id: number,
body: string,
issue_id: number }[] };
type CreateData = { issue: { title: string },
repo2: { name?: string,
slug?: string,
description?: string,
is_public?: boolean,
org_id?: number },
c: { body: string } };
type CreateResp = { id: number,
title: string,
repo: { id: number,
name: string,
slug: string,
description: string,
is_public: boolean,
latest_num: number,
org_id: number },
number: string,
comments: { id: number,
body: string,
issue_id: number }[] };

    function api(id: number) {
      const baseUrl = `${parentPath}/${id}`;
      return {
        
      }
    }

    return Object.assign(api, 
      {
        get: buildGetFn<number, GetResp, "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER">(options, parentPath),
create: buildCreateFn<CreateData,CreateResp, "ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_RESOURCE_NOT_FOUND"|"ERROR_CODE_SERVER_ERROR"|"ERROR_CODE_OTHER"|"ERROR_CODE_VALIDATION">(options, parentPath)
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

      
  export type ListData = { filter?: Record<string, any>; page?: number; pageSize?: number };
  
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
      const url = `${clientOptions.rootPath ?? ''}/${parentPath}`;
      // TODO: add data to URL params with URLSearchParams
  
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
    options: ApiClientOptions,
    url: string,
    init: ApiRequestInit
  ): Promise<ApiResponse<D, E>> {
    if (options.requestFn == null) {
      throw new Error("Request function is required in API client");
    }
  
    return options.requestFn(url, init).then(({status, data, headers = {} }) => {
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



  
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
    headers?: Record<string, string>;
};
export declare function createClient(options?: ApiClientOptions): {
    api: {
        org: ((id: string) => {
            repos: ((id: number) => {
                owner: (() => {}) & {
                    get: GetApiClientOneFn<{
                        id: number;
                        slug: string;
                        name: string;
                    }, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND">;
                    update: UpdateApiClientOneFn<{
                        slug?: string | undefined;
                        name?: string | undefined;
                    }, {
                        id: number;
                        slug: string;
                        name: string;
                    }, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_VALIDATION">;
                    create: CreateApiClientFn<{
                        slug: string;
                        name: string;
                    }, {
                        id: number;
                        slug: string;
                        name: string;
                    }, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_VALIDATION">;
                    delete: DeleteApiClientOneFn<"ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND">;
                    customOneFetch: CustomOneFetchApiClientOneFn<any, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND">;
                    customOneSubmit: CustomOneSubmitApiClientOneFn<undefined, any, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND">;
                };
            }) & {
                get: GetApiClientManyFn<number, {
                    slug: string;
                    name: string;
                }, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND">;
                create: CreateApiClientFn<{
                    slug: string;
                    name: string;
                    description: string;
                    owner_id: number | null;
                    virtProp: string;
                }, {
                    slug: string;
                    name: string;
                }, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_VALIDATION">;
                update: UpdateApiClientManyFn<number, {
                    name?: string | undefined;
                    description?: string | undefined;
                }, {
                    slug: string;
                    name: string;
                }, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_VALIDATION">;
                list: PaginatedListApiClientFn<{
                    slug: string;
                    name: string;
                }, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND">;
                delete: DeleteApiClientManyFn<number, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND">;
                customOneFetch: CustomOneFetchApiClientManyFn<number, any, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND">;
                customOneSubmit: CustomOneSubmitApiClientManyFn<number, undefined, any, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND">;
                customManyFetch: CustomManyFetchApiClientFn<any, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND">;
                customManySubmit: CustomManySubmitApiClientFn<{
                    name: string;
                    counter: number;
                }, any, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_VALIDATION">;
            };
        }) & {
            get: GetApiClientManyFn<string, {
                id: number;
                slug: string;
                name: string;
            }, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND">;
            create: CreateApiClientFn<{
                slug: string;
                name: string;
            }, {
                id: number;
                slug: string;
                name: string;
            }, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_VALIDATION">;
            update: UpdateApiClientManyFn<string, {
                slug?: string | undefined;
                name?: string | undefined;
            }, {
                id: number;
                slug: string;
                name: string;
            }, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_VALIDATION">;
            list: ListApiClientFn<{
                id: number;
                slug: string;
                name: string;
            }, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER">;
            delete: DeleteApiClientManyFn<string, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND">;
            customOneFetch: CustomOneFetchApiClientManyFn<string, any, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND">;
            customOneSubmit: CustomOneSubmitApiClientManyFn<string, {
                extraProp: string;
            }, any, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_VALIDATION">;
            customManyFetch: CustomManyFetchApiClientFn<any, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER">;
            customManySubmit: CustomManySubmitApiClientFn<{
                extraProp: string;
            }, any, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_VALIDATION">;
        };
    };
};
export type EndpointHttpMethod = "GET" | "POST" | /*"PUT" |*/ "PATCH" | "DELETE";
/** Result of API function call */
export type ApiRequestFnData = {
    /** HTTP status */
    status: number;
    /** HTTP repsonse headers map */
    headers: {
        [name: string]: string;
    };
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
};
export type ApiRequestBody = any;
export type ApiResponseErrorBody<C extends string, D = unknown> = C extends any ? {
    code: C;
    message: string;
    data?: D;
} : never;
export type ApiResponse<D, E extends string> = ApiResponseSuccess<D> | ApiResponseError<E>;
export type ApiResponseSuccess<D> = {
    kind: "success";
    status: number;
    headers: {
        [name: string]: string;
    };
    data: D;
};
export type ApiResponseError<E extends string> = {
    kind: "error";
    status: number;
    headers: {
        [name: string]: string;
    };
    error: ApiResponseErrorBody<E>;
};
export type PaginatedListResponse<T> = {
    page: number;
    pageSize: number;
    totalPages: number;
    totalCount: number;
    data: T[];
};
export type PaginatedListData = {
    pageSize?: number;
    page?: number;
};
export type GetApiClientManyFn<ID, R, E extends string> = (id: ID, options?: Partial<ApiRequestInit>) => Promise<ApiResponse<R, E>>;
export type GetApiClientOneFn<R, E extends string> = (options?: Partial<ApiRequestInit>) => Promise<ApiResponse<R, E>>;
export type CreateApiClientFn<D extends ApiRequestBody, R, E extends string> = (data: D, options?: Partial<ApiRequestInit>) => Promise<ApiResponse<R, E>>;
export type UpdateApiClientManyFn<ID, D, R, E extends string> = (id: ID, data: D, options?: Partial<ApiRequestInit>) => Promise<ApiResponse<R, E>>;
export type UpdateApiClientOneFn<D, R, E extends string> = (data: D, options?: Partial<ApiRequestInit>) => Promise<ApiResponse<R, E>>;
export type ListApiClientFn<R, E extends string> = (options?: Partial<ApiRequestInit>) => Promise<ApiResponse<R[], E>>;
export type PaginatedListApiClientFn<R, E extends string> = (data?: PaginatedListData, options?: Partial<ApiRequestInit>) => Promise<ApiResponse<PaginatedListResponse<R>, E>>;
export type DeleteApiClientManyFn<ID, E extends string> = (id: ID, options?: Partial<ApiRequestInit>) => Promise<ApiResponse<void, E>>;
export type DeleteApiClientOneFn<E extends string> = (options?: Partial<ApiRequestInit>) => Promise<ApiResponse<void, E>>;
export type CustomOneFetchApiClientManyFn<ID, R, E extends string> = (id: ID, options?: Partial<ApiRequestInit>) => Promise<ApiResponse<R, E>>;
export type CustomOneSubmitApiClientManyFn<ID, D, R, E extends string> = (id: ID, data?: D, options?: Partial<ApiRequestInit>) => Promise<ApiResponse<R, E>>;
export type CustomOneFetchApiClientOneFn<R, E extends string> = (options?: Partial<ApiRequestInit>) => Promise<ApiResponse<R, E>>;
export type CustomOneSubmitApiClientOneFn<D, R, E extends string> = (data?: D, options?: Partial<ApiRequestInit>) => Promise<ApiResponse<R, E>>;
export type CustomManyFetchApiClientFn<R, E extends string> = (options?: Partial<ApiRequestInit>) => Promise<ApiResponse<R[], E>>;
export type CustomManySubmitApiClientFn<D, R, E extends string> = (data?: D, options?: Partial<ApiRequestInit>) => Promise<ApiResponse<R[], E>>;
type ApiMethod = (...args: any) => any;
/**
 * Returns an array of API method request parameters.
 *
 * Uses "infer" to force TS to resolve actual types instead of showing only this type's definition.
 *
 * Example:
 *
 * ```ts
 * type MyApiDataReqParamsType = ApiRequestParametersType<typeof client.api.org.get>;
 * // =>
 * // type MyApiDataReqParamsType = [data: CreateData, options?: Partial<ApiRequestInit> | undefined]
 * ```
 *
 */
export type ApiRequestParametersType<T extends ApiMethod> = Parameters<T> extends [...infer Rest] ? Rest : never;
/**
 * Returns API success response type.
 *
 * ```ts
 * type MyApiDataRespType = ApiResponseSuccessType<typeof client.api.org.create>;
 * // =>
 * // type MyApiDataRespType = {
 * //   kind: "success";
 * //   status: number;
 * //   headers: {
 * //       [name: string]: string;
 * //   };
 * //   data: GetResp;
 * // }
 * ```
 *
 */
export type ApiResponseSuccessType<T extends ApiMethod> = Extract<Awaited<ReturnType<T>>, {
    kind: "success";
}>;
/**
 * Returns API success response data type.
 *
 * Example:
 *
 * ```ts
 * type MyApiSuccessDataType = ApiResponseSuccessDataType<typeof client.api.org.create>;
 * // =>
 * // type MyApiSuccessDataType = {
 * //   name: string;
 * //   slug: string;
 * //   description: string;
 * //   summary: string;
 * //   nameAndDesc: unknown;
 * //   blank_repos: {
 * //       id: number;
 * //       total_issues: number;
 * //       nameAndDesc: string;
 * //   }[];
 * //   newest_repo_name: string | null;
 * // }Type
 * ```
 *
 */
export type ApiResponseSuccessDataType<T extends ApiMethod> = ApiResponseSuccessType<T>["data"];
/**
 * Returns API error response type.
 *
 * Example:
 *
 * ```ts
 * type MyApiErrResp = ApiResponseErrorType<typeof client.api.org.create>;
 * // =>
 * // type MyApiErrResp = {
 * //   kind: "error";
 * //   status: number;
 * //   headers: {
 * //       [name: string]: string;
 * //   };
 * //   error: {
 * //       code: "ERROR_CODE_SERVER_ERROR";
 * //       message: string;
 * //       data?: unknown;
 * //   } | {
 * //       code: "ERROR_CODE_OTHER";
 * //       message: string;
 * //       data?: unknown;
 * //   } | {
 * //       ...;
 * //   };
 * // }
 * ```
 *
 */
export type ApiResponseErrorType<T extends ApiMethod> = Extract<Awaited<ReturnType<T>>, {
    kind: "error";
}>;
/**
 * Returns API error response data type.
 *
 * Example:
 *
 * ```ts
 * type MyApiErrData = ApiResponseErrorDataType<typeof client.api.org.create>;
 * // =>
 * // type MyApiErrData = {
 * //       code: "ERROR_CODE_SERVER_ERROR";
 * //       message: string;
 * //       data?: unknown;
 * //   } | {
 * //       code: "ERROR_CODE_OTHER";
 * //       message: string;
 * //       data?: unknown;
 * //   } | {
 * //       code: "ERROR_CODE_VALIDATION";
 * //       message: string;
 * //       data?: unknown;
 * //   };
 * // }
 * ```
 *
 */
export type ApiResponseErrorDataType<T extends ApiMethod> = ApiResponseErrorType<T>["error"];
/**
 * Returns a union of API error response codes.
 *
 * Example:
 *
 * ```ts
 * type MyApiErrRespCode = ApiResponseErrorCode<typeof client.api.org.create>;
 * // =>
 * // type MyApiErrRespCode = "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_VALIDATION"
 * ```
 *
*/
export type ApiResponseErrorCodeType<T extends ApiMethod> = ApiResponseErrorType<T>["error"]["code"];
export {};

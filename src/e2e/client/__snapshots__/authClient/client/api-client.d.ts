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
    headers?: Record<string, string>;
};
export declare function createClient(options: ApiClientOptions): {
    api: {
        box: ((id: string) => {
            items: ((id: string) => {}) & {
                get: GetApiClientFn<string, {
                    id: number;
                    name: string;
                    is_public: boolean;
                    box_id: number;
                }, "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER">;
            };
        }) & {
            list: ListApiClientFn<{
                id: number;
                name: string;
                is_public: boolean;
                owner_id: number;
            }, "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER">;
            get: GetApiClientFn<string, {
                id: number;
                name: string;
                is_public: boolean;
                owner_id: number;
            }, "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER">;
            create: CreateApiClientFn<{
                name: string;
                is_public: boolean;
            }, {
                id: number;
                name: string;
                is_public: boolean;
                owner_id: number;
            }, "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_VALIDATION">;
            fetchAuthToken: CustomManySubmitApiClientFn<any, any, "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_VALIDATION">;
        };
        auth: {
            authUser: ((id: number) => {}) & {
                login: CustomManySubmitApiClientFn<any, any, "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_VALIDATION">;
                logout: CustomManySubmitApiClientFn<any, any, "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_VALIDATION">;
                register: CustomManySubmitApiClientFn<any, any, "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_VALIDATION">;
            };
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
export type ApiResponse<D, E extends string> = ApiResponseSuccess<D, E> | ApiResponseError<D, E>;
export type ApiResponseSuccess<D, E extends string> = {
    kind: "success";
    status: number;
    headers: {
        [name: string]: string;
    };
    data: D;
};
export type ApiResponseError<D, E extends string> = {
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
export type GetApiClientFn<ID, R, E extends string> = (id: ID, options?: Partial<ApiRequestInit>) => Promise<ApiResponse<R, E>>;
export type CreateApiClientFn<D extends ApiRequestBody, R, E extends string> = (data: D, options?: Partial<ApiRequestInit>) => Promise<ApiResponse<R, E>>;
export type UpdateApiClientFn<ID, D, R, E extends string> = (id: ID, data: D, options?: Partial<ApiRequestInit>) => Promise<ApiResponse<R, E>>;
export type ListApiClientFn<R, E extends string> = (options?: Partial<ApiRequestInit>) => Promise<ApiResponse<R[], E>>;
export type PaginatedListApiClientFn<R, E extends string> = (data?: PaginatedListData, options?: Partial<ApiRequestInit>) => Promise<ApiResponse<PaginatedListResponse<R>, E>>;
export type DeleteApiClientFn<ID, E extends string> = (id: ID, options?: Partial<ApiRequestInit>) => Promise<ApiResponse<void, E>>;
export type CustomOneFetchApiClientFn<ID, R, E extends string> = (id: ID, options?: Partial<ApiRequestInit>) => Promise<ApiResponse<R, E>>;
export type CustomOneSubmitApiClientFn<ID, D, R, E extends string> = (id: ID, data?: D, options?: Partial<ApiRequestInit>) => Promise<ApiResponse<R, E>>;
export type CustomManyFetchApiClientFn<R, E extends string> = (options?: Partial<ApiRequestInit>) => Promise<ApiResponse<R[], E>>;
export type CustomManySubmitApiClientFn<D, R, E extends string> = (data?: D, options?: Partial<ApiRequestInit>) => Promise<ApiResponse<R[], E>>;

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
        org: ((id: string) => {
            repos: ((id: number) => {
                issues: ((id: number) => {}) & {
                    get: GetApiClientFn<number, {
                        id: number;
                        title: string;
                        repo: {
                            id: number;
                            name: string;
                            slug: string;
                            description: string;
                            is_public: boolean;
                            latest_num: number;
                            org_id: number;
                        };
                        number: string;
                        comments: {
                            id: number;
                            body: string;
                            issue_id: number;
                        }[];
                    }, "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER">;
                    create: CreateApiClientFn<{
                        issue: {
                            title: string;
                        };
                        repo2: {
                            name?: string | undefined;
                            slug?: string | undefined;
                            description?: string | undefined;
                            is_public?: boolean | undefined;
                            org_id?: number | undefined;
                        };
                        c: {
                            body: string;
                        };
                    }, {
                        id: number;
                        title: string;
                        repo: {
                            id: number;
                            name: string;
                            slug: string;
                            description: string;
                            is_public: boolean;
                            latest_num: number;
                            org_id: number;
                        };
                        number: string;
                        comments: {
                            id: number;
                            body: string;
                            issue_id: number;
                        }[];
                    }, "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_VALIDATION">;
                };
            }) & {
                get: GetApiClientFn<number, {
                    id: number;
                    slug: string;
                    description: string;
                    org_id: number;
                }, "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER">;
                list: ListApiClientFn<{
                    id: number;
                    slug: string;
                    description: string;
                    org_id: number;
                }, "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER">;
                create: CreateApiClientFn<{
                    raw_description: string;
                    name: string;
                    is_public: boolean;
                }, {
                    id: number;
                    slug: string;
                    description: string;
                    org_id: number;
                }, "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_VALIDATION">;
                update: UpdateApiClientFn<number, {
                    name?: string | undefined;
                    slug?: string | undefined;
                    description?: string | undefined;
                    is_public?: boolean | undefined;
                    latest_num?: number | undefined;
                    org_id?: number | undefined;
                }, {
                    id: number;
                    slug: string;
                    description: string;
                    org_id: number;
                }, "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_VALIDATION">;
                delete: DeleteApiClientFn<number, "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER">;
            };
        }) & {
            customOneAction: CustomOneSubmitApiClientFn<string, any, any, "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_VALIDATION">;
            customManyAction: CustomManySubmitApiClientFn<any, any, "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_VALIDATION">;
            customOneActionResponds: CustomOneSubmitApiClientFn<string, any, any, "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_VALIDATION">;
            customManyActionResponds: CustomManySubmitApiClientFn<any, any, "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_VALIDATION">;
            customOneQueryAction: CustomOneSubmitApiClientFn<string, any, any, "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_VALIDATION">;
            customFetchAction: CustomOneSubmitApiClientFn<string, any, any, "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_VALIDATION">;
            hookErrorResponse: CustomManySubmitApiClientFn<any, any, "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_VALIDATION">;
            customGet: CustomOneFetchApiClientFn<string, any, "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER">;
            customUpdate: CustomOneSubmitApiClientFn<string, any, any, "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_VALIDATION">;
            customDelete: CustomOneFetchApiClientFn<string, any, "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER">;
            customList: CustomManyFetchApiClientFn<any, "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER">;
            customCreate: CustomManySubmitApiClientFn<any, any, "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_VALIDATION">;
            get: GetApiClientFn<string, {
                name: string;
                slug: string;
                description: string;
                summary: unknown;
                nameAndDesc: unknown;
            }, "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER">;
            list: ListApiClientFn<{
                name: string;
                slug: string;
                description: string;
                summary: unknown;
                nameAndDesc: unknown;
            }, "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER">;
            create: CreateApiClientFn<{
                name: string;
                slug: string;
                description: string;
            }, {
                name: string;
                slug: string;
                description: string;
                summary: unknown;
                nameAndDesc: unknown;
            }, "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_VALIDATION">;
            update: UpdateApiClientFn<string, {
                name?: string | undefined;
                slug?: string | undefined;
                description?: string | undefined;
            }, {
                name: string;
                slug: string;
                description: string;
                summary: unknown;
                nameAndDesc: unknown;
            }, "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_VALIDATION">;
            delete: DeleteApiClientFn<string, "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER">;
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
export type ListData = {
    filter?: Record<string, any>;
    page?: number;
    pageSize?: number;
};
export type GetApiClientFn<ID, R, E extends string> = (id: ID, options?: Partial<ApiRequestInit>) => Promise<ApiResponse<R, E>>;
export type CreateApiClientFn<D extends ApiRequestBody, R, E extends string> = (data: D, options?: Partial<ApiRequestInit>) => Promise<ApiResponse<R, E>>;
export type UpdateApiClientFn<ID, D, R, E extends string> = (id: ID, data: D, options?: Partial<ApiRequestInit>) => Promise<ApiResponse<R, E>>;
export type ListApiClientFn<R, E extends string> = (data?: ListData, options?: Partial<ApiRequestInit>) => Promise<ApiResponse<R[], E>>;
export type DeleteApiClientFn<ID, E extends string> = (id: ID, options?: Partial<ApiRequestInit>) => Promise<ApiResponse<void, E>>;
export type CustomOneFetchApiClientFn<ID, R, E extends string> = (id: ID, options?: Partial<ApiRequestInit>) => Promise<ApiResponse<R, E>>;
export type CustomOneSubmitApiClientFn<ID, D, R, E extends string> = (id: ID, data?: D, options?: Partial<ApiRequestInit>) => Promise<ApiResponse<R, E>>;
export type CustomManyFetchApiClientFn<R, E extends string> = (options?: Partial<ApiRequestInit>) => Promise<ApiResponse<R[], E>>;
export type CustomManySubmitApiClientFn<D, R, E extends string> = (data?: D, options?: Partial<ApiRequestInit>) => Promise<ApiResponse<R[], E>>;

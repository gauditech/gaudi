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
export declare function createClient(options: ApiClientOptions): {
    api: {
        org: ((id: string) => {
            repos: ((id: number) => {
                issues: ((id: number) => {}) & {
                    get: GetApiClientManyFn<number, {
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
                        number: number;
                        comments: {
                            id: number;
                            body: string;
                            issue_id: number;
                        }[];
                    }, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND">;
                    create: CreateApiClientFn<{
                        title: string;
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
                        number: number;
                        comments: {
                            id: number;
                            body: string;
                            issue_id: number;
                        }[];
                    }, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_VALIDATION">;
                };
            }) & {
                get: GetApiClientManyFn<number, {
                    id: number;
                    slug: string;
                    description: string;
                    org_id: number;
                }, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND">;
                list: ListApiClientFn<{
                    id: number;
                    slug: string;
                    description: string;
                    org_id: number;
                }, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND">;
                create: CreateApiClientFn<{
                    name: string;
                    description?: string | undefined;
                    raw_description: string;
                }, {
                    id: number;
                    slug: string;
                    description: string;
                    org_id: number;
                }, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_VALIDATION">;
                update: UpdateApiClientManyFn<number, {
                    description?: string | undefined;
                }, {
                    id: number;
                    slug: string;
                    description: string;
                    org_id: number;
                }, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_VALIDATION">;
                delete: DeleteApiClientManyFn<number, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND">;
            };
        }) & {
            customOneAction: CustomOneSubmitApiClientManyFn<string, {
                name: string;
                counter: number;
                customProp: string;
            }, any, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_VALIDATION">;
            customManyAction: CustomManySubmitApiClientFn<{
                name: string;
                counter: number;
            }, any, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_VALIDATION">;
            customOneActionResponds: CustomOneSubmitApiClientManyFn<string, {
                counter: number;
                name: string;
            }, any, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_VALIDATION">;
            customManyActionResponds: CustomManySubmitApiClientFn<{
                name: string;
                counter: number;
            }, any, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_VALIDATION">;
            customManyRespondActionStatic: CustomManySubmitApiClientFn<undefined, any, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER">;
            customManyRespondActionSimple: CustomManySubmitApiClientFn<{
                body: string;
            }, any, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_VALIDATION">;
            customManyRespondActionComplex: CustomManySubmitApiClientFn<{
                prop1: string;
                prop2: number;
                statusCode: number;
                header1: string;
                header2: string;
            }, any, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_VALIDATION">;
            customOneQueryAction: CustomOneSubmitApiClientManyFn<string, {
                name: string;
                orgId: number;
            }, any, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_VALIDATION">;
            customFetchAction: CustomOneSubmitApiClientManyFn<string, {
                name: string;
            }, any, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_VALIDATION">;
            hookErrorResponse: CustomManySubmitApiClientFn<{
                status: number;
                message: string;
            }, any, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_VALIDATION">;
            customGet: CustomOneFetchApiClientManyFn<string, any, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND">;
            customUpdate: CustomOneSubmitApiClientManyFn<string, {
                newOrg: {
                    name?: string | undefined;
                    description?: string | undefined;
                };
            }, any, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_VALIDATION">;
            customDelete: CustomOneFetchApiClientManyFn<string, any, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND">;
            customList: CustomManyFetchApiClientFn<any, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER">;
            customCreate: CustomManySubmitApiClientFn<{
                newOrg: {
                    name: string;
                    slug: string;
                    description: string;
                };
            }, any, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_VALIDATION">;
            get: GetApiClientManyFn<string, {
                name: string;
                slug: string;
                description: string;
                summary: string;
                nameAndDesc: unknown;
                blank_repos: {
                    id: number;
                    total_issues: number;
                    nameAndDesc: string;
                }[];
                newest_repo_name: string | null;
            }, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND">;
            list: PaginatedListApiClientFn<{
                name: string;
                slug: string;
                description: string;
                summary: string;
                nameAndDesc: unknown;
                blank_repos: {
                    id: number;
                    total_issues: number;
                    nameAndDesc: string;
                }[];
                newest_repo_name: string | null;
            }, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER">;
            create: CreateApiClientFn<{
                name: string;
                slug: string;
                description: string;
            }, {
                name: string;
                slug: string;
                description: string;
                summary: string;
                nameAndDesc: unknown;
                blank_repos: {
                    id: number;
                    total_issues: number;
                    nameAndDesc: string;
                }[];
                newest_repo_name: string | null;
            }, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_VALIDATION">;
            update: UpdateApiClientManyFn<string, {
                name?: string | undefined;
                description?: string | undefined;
            }, {
                name: string;
                slug: string;
                description: string;
                summary: string;
                nameAndDesc: unknown;
                blank_repos: {
                    id: number;
                    total_issues: number;
                    nameAndDesc: string;
                }[];
                newest_repo_name: string | null;
            }, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND" | "ERROR_CODE_VALIDATION">;
            delete: DeleteApiClientManyFn<string, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND">;
        };
        repo: ((id: number) => {}) & {
            list: ListApiClientFn<{
                id: number;
                slug: string;
                description: string;
                org_id: number;
            }, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER">;
            get: GetApiClientManyFn<number, {
                id: number;
                slug: string;
                description: string;
                org_id: number;
            }, "ERROR_CODE_SERVER_ERROR" | "ERROR_CODE_OTHER" | "ERROR_CODE_RESOURCE_NOT_FOUND">;
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

"use strict";
// ---- imports & declarations
Object.defineProperty(exports, "__esModule", { value: true });
exports.createClient = void 0;
function createClient(options) {
    const resolvedOptions = options ?? {};
    const internalOptions = {
        rootPath: resolvedOptions.rootPath,
        requestFn: (resolvedOptions.requestFn ?? resolveDefaultRequestFn()),
        headers: { ...(resolvedOptions.headers ?? {}) },
    };
    return {
        api: {
            ...buildApi(internalOptions)
        }
    };
}
exports.createClient = createClient;
function buildApi(options) {
    function buildOrgEntrypoint(options, parentPath) {
        // entrypoint function
        function api(id) {
            const baseUrl = `${parentPath}/${id}`;
            return {
                repos: buildReposEntrypoint(options, `${baseUrl}/repos`)
            };
        }
        // endpoint functions
        return Object.assign(api, {
            get: buildGetManyFn(options, parentPath),
            create: buildCreateFn(options, parentPath),
            update: buildUpdateManyFn(options, parentPath),
            list: buildListFn(options, parentPath),
            delete: buildDeleteManyFn(options, parentPath),
            customOneFetch: buildCustomOneFetchManyFn(options, parentPath, "customOneFetch", "GET"),
            customOneSubmit: buildCustomOneSubmitManyFn(options, parentPath, "customOneSubmit", "PATCH"),
            customManyFetch: buildCustomManyFetchFn(options, parentPath, "customManyFetch", "GET"),
            customManySubmit: buildCustomManySubmitFn(options, parentPath, "customManySubmit", "POST")
        });
    }
    function buildReposEntrypoint(options, parentPath) {
        // entrypoint function
        function api(id) {
            const baseUrl = `${parentPath}/${id}`;
            return {
                owner: buildOwnerEntrypoint(options, `${baseUrl}/owner`)
            };
        }
        // endpoint functions
        return Object.assign(api, {
            get: buildGetManyFn(options, parentPath),
            create: buildCreateFn(options, parentPath),
            update: buildUpdateManyFn(options, parentPath),
            list: buildPaginatedListFn(options, parentPath),
            delete: buildDeleteManyFn(options, parentPath),
            customOneFetch: buildCustomOneFetchManyFn(options, parentPath, "customOneFetch", "GET"),
            customOneSubmit: buildCustomOneSubmitManyFn(options, parentPath, "customOneSubmit", "PATCH"),
            customManyFetch: buildCustomManyFetchFn(options, parentPath, "customManyFetch", "GET"),
            customManySubmit: buildCustomManySubmitFn(options, parentPath, "customManySubmit", "POST")
        });
    }
    function buildOwnerEntrypoint(options, parentPath) {
        // entrypoint function
        function api() {
            const baseUrl = `${parentPath}`;
            return {};
        }
        // endpoint functions
        return Object.assign(api, {
            get: buildGetOneFn(options, parentPath),
            update: buildUpdateOneFn(options, parentPath),
            create: buildCreateFn(options, parentPath),
            delete: buildDeleteOneFn(options, parentPath),
            customOneFetch: buildCustomOneFetchOneFn(options, parentPath, "customOneFetch", "GET"),
            customOneSubmit: buildCustomOneSubmitOneFn(options, parentPath, "customOneSubmit", "PATCH")
        });
    }
    return {
        org: buildOrgEntrypoint(options, "/api/org")
    };
}
// ----- API fn factories
function buildGetManyFn(clientOptions, parentPath) {
    return async (id, options) => {
        const url = `${clientOptions.rootPath ?? ''}${parentPath}/${id}`;
        return (makeRequest(clientOptions, url, {
            method: "GET",
            headers: { ...(options?.headers ?? {}) },
        }));
    };
}
function buildGetOneFn(clientOptions, parentPath) {
    return async (options) => {
        const url = `${clientOptions.rootPath ?? ''}${parentPath}`;
        return (makeRequest(clientOptions, url, {
            method: "GET",
            headers: { ...(options?.headers ?? {}) },
        }));
    };
}
function buildCreateFn(clientOptions, parentPath) {
    return async (data, options) => {
        const url = `${clientOptions.rootPath ?? ''}${parentPath}`;
        return (makeRequest(clientOptions, url, {
            method: "POST",
            body: data,
            headers: { ...(options?.headers ?? {}) },
        }));
    };
}
function buildUpdateManyFn(clientOptions, parentPath) {
    return async (id, data, options) => {
        const url = `${clientOptions.rootPath ?? ''}${parentPath}/${id}`;
        return (makeRequest(clientOptions, url, {
            method: "PATCH",
            body: data,
            headers: { ...(options?.headers ?? {}) },
        }));
    };
}
function buildUpdateOneFn(clientOptions, parentPath) {
    return async (data, options) => {
        const url = `${clientOptions.rootPath ?? ''}${parentPath}`;
        return (makeRequest(clientOptions, url, {
            method: "PATCH",
            body: data,
            headers: { ...(options?.headers ?? {}) },
        }));
    };
}
function buildDeleteManyFn(clientOptions, parentPath) {
    return async (id, options) => {
        const url = `${clientOptions.rootPath ?? ''}${parentPath}/${id}`;
        return (makeRequest(clientOptions, url, {
            method: "DELETE",
            headers: { ...(options?.headers ?? {}) },
        }));
    };
}
function buildDeleteOneFn(clientOptions, parentPath) {
    return async (options) => {
        const url = `${clientOptions.rootPath ?? ''}${parentPath}`;
        return (makeRequest(clientOptions, url, {
            method: "DELETE",
            headers: { ...(options?.headers ?? {}) },
        }));
    };
}
function buildListFn(clientOptions, parentPath) {
    return async (options) => {
        const urlPath = `${clientOptions.rootPath ?? ''}${parentPath}`;
        return (makeRequest(clientOptions, urlPath, {
            method: "GET",
            headers: { ...(options?.headers ?? {}) },
        }));
    };
}
function buildPaginatedListFn(clientOptions, parentPath) {
    return async (data, options) => {
        const urlPath = `${clientOptions.rootPath ?? ''}${parentPath}`;
        const params = new URLSearchParams();
        Object.entries(data ?? {}).map(([key, value]) => params.set(key, JSON.stringify(value)));
        const urlParams = params.toString();
        const url = urlPath + (urlParams ? '?' + urlParams : '');
        return (makeRequest(clientOptions, url, {
            method: "GET",
            headers: { ...(options?.headers ?? {}) },
        }));
    };
}
function buildCustomOneFetchManyFn(clientOptions, parentPath, path, method) {
    return async (id, options) => {
        const url = `${clientOptions.rootPath ?? ''}${parentPath}/${id}/${path}`;
        return (makeRequest(clientOptions, url, {
            method,
            headers: { ...(options?.headers ?? {}) },
        }));
    };
}
function buildCustomOneSubmitManyFn(clientOptions, parentPath, path, method) {
    return async (id, data, options) => {
        const url = `${clientOptions.rootPath ?? ''}${parentPath}/${id}/${path}`;
        return (makeRequest(clientOptions, url, {
            method,
            body: data,
            headers: { ...(options?.headers ?? {}) },
        }));
    };
}
function buildCustomOneFetchOneFn(clientOptions, parentPath, path, method) {
    return async (options) => {
        const url = `${clientOptions.rootPath ?? ''}${parentPath}/${path}`;
        return (makeRequest(clientOptions, url, {
            method,
            headers: { ...(options?.headers ?? {}) },
        }));
    };
}
function buildCustomOneSubmitOneFn(clientOptions, parentPath, path, method) {
    return async (data, options) => {
        const url = `${clientOptions.rootPath ?? ''}${parentPath}/${path}`;
        return (makeRequest(clientOptions, url, {
            method,
            body: data,
            headers: { ...(options?.headers ?? {}) },
        }));
    };
}
function buildCustomManyFetchFn(clientOptions, parentPath, path, method) {
    return async (options) => {
        const url = `${clientOptions.rootPath ?? ''}${parentPath}/${path}`;
        return (makeRequest(clientOptions, url, {
            method,
            headers: { ...(options?.headers ?? {}) },
        }));
    };
}
function buildCustomManySubmitFn(clientOptions, parentPath, path, method) {
    return async (data, options) => {
        const url = `${clientOptions.rootPath ?? ''}${parentPath}/${path}`;
        return (makeRequest(clientOptions, url, {
            method,
            body: data,
            headers: { ...(options?.headers ?? {}) },
        }));
    };
}
async function makeRequest(clientOptions, url, init) {
    if (clientOptions.requestFn == null) {
        throw new Error("Request function is required in API client");
    }
    const reqUrl = url;
    const reqInit = {
        ...init,
        headers: {
            ...clientOptions.headers,
            ...(init.headers ?? {})
        }
    };
    return clientOptions.requestFn(reqUrl, reqInit).then(({ status, data, headers = {} }) => {
        if (status >= 200 && status < 300) {
            return {
                kind: "success",
                status,
                headers,
                data,
            };
        }
        else {
            if (data == null) {
                return {
                    kind: "error",
                    status,
                    headers,
                    error: {
                        code: "ERROR_CODE_OTHER",
                        message: "empty response",
                    },
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
                    },
                    // TODO: fix response error type (TS complains about types not overlapping!?)
                };
            }
            else {
                if ("code" in data && "message" in data) {
                    return {
                        kind: "error",
                        status,
                        headers,
                        error: data,
                    };
                }
                else {
                    return {
                        kind: "error",
                        status,
                        headers,
                        error: {
                            code: "ERROR_CODE_OTHER",
                            message: "Unexpected error",
                            data,
                        },
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
    if (fetch === undefined)
        return;
    return (url, init) => {
        const method = init.method;
        const headers = new Headers({
            // presume JSON request but allow overriding by `init.headers`
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            ...(init.headers ?? {})
        });
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
            .then(async (response) => {
            // detect JSON response
            const isJsonResp = (response.headers.get("content-type") ?? "").indexOf("/json") !== -1;
            const status = response.status;
            const data = isJsonResp ? await response.json() : await response.text(); // pick response data type
            const headers = Object.fromEntries(response.headers.entries()); // copy headers structure
            return {
                status,
                data,
                headers
            };
        }));
    };
}

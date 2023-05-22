"use strict";
// ----- API client
Object.defineProperty(exports, "__esModule", { value: true });
exports.createClient = void 0;
function createClient(options) {
    const internalOptions = {
        rootPath: options.rootPath,
        requestFn: options.requestFn,
        headers: { ...(options.headers ?? {}) },
    };
    return {
        api: {
            ...buildApi(internalOptions ?? {})
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
            get: buildGetFn(options, parentPath),
            create: buildCreateFn(options, parentPath),
            update: buildUpdateFn(options, parentPath),
            list: buildListFn(options, parentPath),
            delete: buildDeleteFn(options, parentPath),
            customOneFetch: buildCustomOneFetchFn(options, parentPath, "customOneFetch", "GET"),
            customOneSubmit: buildCustomOneSubmitFn(options, parentPath, "customOneSubmit", "PATCH"),
            customManyFetch: buildCustomManyFetchFn(options, parentPath, "customManyFetch", "GET"),
            customManySubmit: buildCustomManySubmitFn(options, parentPath, "customManySubmit", "POST")
        });
    }
    function buildReposEntrypoint(options, parentPath) {
        // entrypoint function
        function api(id) {
            const baseUrl = `${parentPath}/${id}`;
            return {};
        }
        // endpoint functions
        return Object.assign(api, {
            get: buildGetFn(options, parentPath),
            create: buildCreateFn(options, parentPath),
            update: buildUpdateFn(options, parentPath),
            list: buildPaginatedListFn(options, parentPath),
            delete: buildDeleteFn(options, parentPath),
            customOneFetch: buildCustomOneFetchFn(options, parentPath, "customOneFetch", "GET"),
            customOneSubmit: buildCustomOneSubmitFn(options, parentPath, "customOneSubmit", "PATCH"),
            customManyFetch: buildCustomManyFetchFn(options, parentPath, "customManyFetch", "GET"),
            customManySubmit: buildCustomManySubmitFn(options, parentPath, "customManySubmit", "POST")
        });
    }
    return {
        org: buildOrgEntrypoint(options, "/api/org")
    };
}
// ----- API fn factories
function buildGetFn(clientOptions, parentPath) {
    return async (id, options) => {
        const url = `${clientOptions.rootPath ?? ''}${parentPath}/${id}`;
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
function buildUpdateFn(clientOptions, parentPath) {
    return async (id, data, options) => {
        const url = `${clientOptions.rootPath ?? ''}${parentPath}/${id}`;
        return (makeRequest(clientOptions, url, {
            method: "PATCH",
            body: data,
            headers: { ...(options?.headers ?? {}) },
        }));
    };
}
function buildDeleteFn(clientOptions, parentPath) {
    return async (id, options) => {
        const url = `${clientOptions.rootPath ?? ''}${parentPath}/${id}`;
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
function buildCustomOneFetchFn(clientOptions, parentPath, path, method) {
    return async (id, options) => {
        const url = `${clientOptions.rootPath ?? ''}${parentPath}/${id}/${path}`;
        return (makeRequest(clientOptions, url, {
            method,
            headers: { ...(options?.headers ?? {}) },
        }));
    };
}
function buildCustomOneSubmitFn(clientOptions, parentPath, path, method) {
    return async (id, data, options) => {
        const url = `${clientOptions.rootPath ?? ''}${parentPath}/${id}/${path}`;
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

// ----- API client
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
export function createClient(options) {
    var _a;
    const internalOptions = {
        rootPath: options.rootPath,
        requestFn: options.requestFn,
        headers: Object.assign({}, ((_a = options.headers) !== null && _a !== void 0 ? _a : {})),
    };
    return {
        api: buildApi(internalOptions !== null && internalOptions !== void 0 ? internalOptions : {}),
    };
}
function buildApi(options) {
    return {
        org: buildOrgApi(options, "org")
    };
}
function buildOrgApi(options, parentPath) {
    // entrypoint function
    function api(id) {
        const baseUrl = `${parentPath}/${id}`;
        return {
            repos: buildReposApi(options, `${baseUrl}/repos`),
            publicRepos: buildPublicReposApi(options, `${baseUrl}/public_repos`),
            publicIssues: buildPublicIssuesApi(options, `${baseUrl}/public_issues`),
            members: buildMembersApi(options, `${baseUrl}/members`)
        };
    }
    // endpoint functions
    return Object.assign(api, {
        get: buildGetFn(options, parentPath),
        list: buildListFn(options, parentPath),
        create: buildCreateFn(options, parentPath),
        update: buildUpdateFn(options, parentPath)
    });
}
function buildReposApi(options, parentPath) {
    // entrypoint function
    function api(id) {
        const baseUrl = `${parentPath}/${id}`;
        return {};
    }
    // endpoint functions
    return Object.assign(api, {
        get: buildGetFn(options, parentPath),
        list: buildListFn(options, parentPath),
        create: buildCreateFn(options, parentPath),
        update: buildUpdateFn(options, parentPath),
        delete: buildDeleteFn(options, parentPath)
    });
}
function buildPublicReposApi(options, parentPath) {
    // entrypoint function
    function api(id) {
        const baseUrl = `${parentPath}/${id}`;
        return {};
    }
    // endpoint functions
    return Object.assign(api, {
        get: buildGetFn(options, parentPath),
        list: buildListFn(options, parentPath)
    });
}
function buildPublicIssuesApi(options, parentPath) {
    // entrypoint function
    function api(id) {
        const baseUrl = `${parentPath}/${id}`;
        return {};
    }
    // endpoint functions
    return Object.assign(api, {
        list: buildListFn(options, parentPath)
    });
}
function buildMembersApi(options, parentPath) {
    // entrypoint function
    function api(id) {
        const baseUrl = `${parentPath}/${id}`;
        return {};
    }
    // endpoint functions
    return Object.assign(api, {
        list: buildListFn(options, parentPath),
        get: buildGetFn(options, parentPath)
    });
}
// ----- API fn factories
function buildGetFn(clientOptions, parentPath) {
    return (id, options) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const url = `${(_a = clientOptions.rootPath) !== null && _a !== void 0 ? _a : ''}/${parentPath}/${id}`;
        return (makeRequest(clientOptions, url, {
            method: "GET",
            headers: Object.assign({}, ((_b = options === null || options === void 0 ? void 0 : options.headers) !== null && _b !== void 0 ? _b : {})),
        }));
    });
}
function buildCreateFn(clientOptions, parentPath) {
    return (data, options) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const url = `${(_a = clientOptions.rootPath) !== null && _a !== void 0 ? _a : ''}/${parentPath}`;
        return (makeRequest(clientOptions, url, {
            method: "POST",
            body: data,
            headers: Object.assign({}, ((_b = options === null || options === void 0 ? void 0 : options.headers) !== null && _b !== void 0 ? _b : {})),
        }));
    });
}
function buildUpdateFn(clientOptions, parentPath) {
    return (id, data, options) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const url = `${(_a = clientOptions.rootPath) !== null && _a !== void 0 ? _a : ''}/${parentPath}/${id}`;
        return (makeRequest(clientOptions, url, {
            method: "PATCH",
            body: data,
            headers: Object.assign({}, ((_b = options === null || options === void 0 ? void 0 : options.headers) !== null && _b !== void 0 ? _b : {})),
        }));
    });
}
function buildDeleteFn(clientOptions, parentPath) {
    return (id, options) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const url = `${(_a = clientOptions.rootPath) !== null && _a !== void 0 ? _a : ''}/${parentPath}/${id}`;
        return (makeRequest(clientOptions, url, {
            method: "DELETE",
            headers: Object.assign({}, ((_b = options === null || options === void 0 ? void 0 : options.headers) !== null && _b !== void 0 ? _b : {})),
        }));
    });
}
function buildListFn(clientOptions, parentPath) {
    return (data, options) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const url = `${(_a = clientOptions.rootPath) !== null && _a !== void 0 ? _a : ''}/${parentPath}`;
        // TODO: add data to URL params with URLSearchParams
        return (makeRequest(clientOptions, url, {
            method: "GET",
            headers: Object.assign({}, ((_b = options === null || options === void 0 ? void 0 : options.headers) !== null && _b !== void 0 ? _b : {})),
        }));
    });
}
function buildCustomOneFetchFn(clientOptions, parentPath, path, method) {
    return (id, options) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const url = `${(_a = clientOptions.rootPath) !== null && _a !== void 0 ? _a : ''}/${parentPath}/${id}/${path}`;
        return (makeRequest(clientOptions, url, {
            method,
            headers: Object.assign({}, ((_b = options === null || options === void 0 ? void 0 : options.headers) !== null && _b !== void 0 ? _b : {})),
        }));
    });
}
function buildCustomOneSubmitFn(clientOptions, parentPath, path, method) {
    return (id, data, options) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const url = `${(_a = clientOptions.rootPath) !== null && _a !== void 0 ? _a : ''}/${parentPath}/${id}/${path}`;
        return (makeRequest(clientOptions, url, {
            method,
            body: data,
            headers: Object.assign({}, ((_b = options === null || options === void 0 ? void 0 : options.headers) !== null && _b !== void 0 ? _b : {})),
        }));
    });
}
function buildCustomManyFetchFn(clientOptions, parentPath, path, method) {
    return (options) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const url = `${(_a = clientOptions.rootPath) !== null && _a !== void 0 ? _a : ''}/${parentPath}/${path}`;
        return (makeRequest(clientOptions, url, {
            method,
            headers: Object.assign({}, ((_b = options === null || options === void 0 ? void 0 : options.headers) !== null && _b !== void 0 ? _b : {})),
        }));
    });
}
function buildCustomManySubmitFn(clientOptions, parentPath, path, method) {
    return (data, options) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const url = `${(_a = clientOptions.rootPath) !== null && _a !== void 0 ? _a : ''}/${parentPath}/${path}`;
        return (makeRequest(clientOptions, url, {
            method,
            body: data,
            headers: Object.assign({}, ((_b = options === null || options === void 0 ? void 0 : options.headers) !== null && _b !== void 0 ? _b : {})),
        }));
    });
}
function makeRequest(clientOptions, url, init) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        if (clientOptions.requestFn == null) {
            throw new Error("Request function is required in API client");
        }
        const reqUrl = url;
        const reqInit = Object.assign(Object.assign({}, init), { headers: Object.assign(Object.assign({}, clientOptions.headers), ((_a = init.headers) !== null && _a !== void 0 ? _a : {})) });
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
    });
}

"use strict";
// ----- API client
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createClient = void 0;
function createClient(options) {
    return {
        api: buildApi(options !== null && options !== void 0 ? options : {}),
    };
}
exports.createClient = createClient;
function buildApi(options) {
    return {
        org: buildOrgApi(options, "org")
    };
}
function buildOrgApi(options, parentPath) {
    // entrypoint function
    function api(id) {
        var baseUrl = "".concat(parentPath, "/").concat(id);
        return {
            repos: buildReposApi(options, "".concat(baseUrl, "/repos"))
        };
    }
    // endpoint functions
    return Object.assign(api, {
        customOneAction: buildCustomOneSubmitFn(options, parentPath, "customOneAction", "POST"),
        customManyAction: buildCustomManySubmitFn(options, parentPath, "customManyAction", "PATCH"),
        customOneActionResponds: buildCustomOneSubmitFn(options, parentPath, "customOneActionResponds", "POST"),
        customManyActionResponds: buildCustomManySubmitFn(options, parentPath, "customManyActionResponds", "PATCH"),
        customOneQueryAction: buildCustomOneSubmitFn(options, parentPath, "customOneQueryAction", "POST"),
        customFetchAction: buildCustomOneSubmitFn(options, parentPath, "customFetchAction", "POST"),
        hookErrorResponse: buildCustomManySubmitFn(options, parentPath, "hookErrorResponse", "POST"),
        customGet: buildCustomOneFetchFn(options, parentPath, "customGet", "GET"),
        customUpdate: buildCustomOneSubmitFn(options, parentPath, "customUpdate", "PATCH"),
        customDelete: buildCustomOneFetchFn(options, parentPath, "customDelete", "DELETE"),
        customList: buildCustomManyFetchFn(options, parentPath, "customList", "GET"),
        customCreate: buildCustomManySubmitFn(options, parentPath, "customCreate", "POST"),
        get: buildGetFn(options, parentPath),
        list: buildListFn(options, parentPath),
        create: buildCreateFn(options, parentPath),
        update: buildUpdateFn(options, parentPath),
        delete: buildDeleteFn(options, parentPath)
    });
}
function buildReposApi(options, parentPath) {
    // entrypoint function
    function api(id) {
        var baseUrl = "".concat(parentPath, "/").concat(id);
        return {
            issues: buildIssuesApi(options, "".concat(baseUrl, "/issues"))
        };
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
function buildIssuesApi(options, parentPath) {
    // entrypoint function
    function api(id) {
        var baseUrl = "".concat(parentPath, "/").concat(id);
        return {};
    }
    // endpoint functions
    return Object.assign(api, {
        get: buildGetFn(options, parentPath),
        create: buildCreateFn(options, parentPath)
    });
}
// ----- API fn factories
function buildGetFn(clientOptions, parentPath) {
    var _this = this;
    return function (id, options) { return __awaiter(_this, void 0, void 0, function () {
        var url;
        var _a, _b;
        return __generator(this, function (_c) {
            url = "".concat((_a = clientOptions.rootPath) !== null && _a !== void 0 ? _a : '', "/").concat(parentPath, "/").concat(id);
            return [2 /*return*/, (makeRequest(clientOptions, url, {
                    method: "GET",
                    headers: __assign({}, ((_b = options === null || options === void 0 ? void 0 : options.headers) !== null && _b !== void 0 ? _b : {})),
                }))];
        });
    }); };
}
function buildCreateFn(clientOptions, parentPath) {
    var _this = this;
    return function (data, options) { return __awaiter(_this, void 0, void 0, function () {
        var url;
        var _a, _b;
        return __generator(this, function (_c) {
            url = "".concat((_a = clientOptions.rootPath) !== null && _a !== void 0 ? _a : '', "/").concat(parentPath);
            return [2 /*return*/, (makeRequest(clientOptions, url, {
                    method: "POST",
                    body: data,
                    headers: __assign({}, ((_b = options === null || options === void 0 ? void 0 : options.headers) !== null && _b !== void 0 ? _b : {})),
                }))];
        });
    }); };
}
function buildUpdateFn(clientOptions, parentPath) {
    var _this = this;
    return function (id, data, options) { return __awaiter(_this, void 0, void 0, function () {
        var url;
        var _a, _b;
        return __generator(this, function (_c) {
            url = "".concat((_a = clientOptions.rootPath) !== null && _a !== void 0 ? _a : '', "/").concat(parentPath, "/").concat(id);
            return [2 /*return*/, (makeRequest(clientOptions, url, {
                    method: "PATCH",
                    body: data,
                    headers: __assign({}, ((_b = options === null || options === void 0 ? void 0 : options.headers) !== null && _b !== void 0 ? _b : {})),
                }))];
        });
    }); };
}
function buildDeleteFn(clientOptions, parentPath) {
    var _this = this;
    return function (id, options) { return __awaiter(_this, void 0, void 0, function () {
        var url;
        var _a, _b;
        return __generator(this, function (_c) {
            url = "".concat((_a = clientOptions.rootPath) !== null && _a !== void 0 ? _a : '', "/").concat(parentPath, "/").concat(id);
            return [2 /*return*/, (makeRequest(clientOptions, url, {
                    method: "DELETE",
                    headers: __assign({}, ((_b = options === null || options === void 0 ? void 0 : options.headers) !== null && _b !== void 0 ? _b : {})),
                }))];
        });
    }); };
}
function buildListFn(clientOptions, parentPath) {
    var _this = this;
    return function (data, options) { return __awaiter(_this, void 0, void 0, function () {
        var url;
        var _a, _b;
        return __generator(this, function (_c) {
            url = "".concat((_a = clientOptions.rootPath) !== null && _a !== void 0 ? _a : '', "/").concat(parentPath);
            // TODO: add data to URL params with URLSearchParams
            return [2 /*return*/, (makeRequest(clientOptions, url, {
                    method: "GET",
                    headers: __assign({}, ((_b = options === null || options === void 0 ? void 0 : options.headers) !== null && _b !== void 0 ? _b : {})),
                }))];
        });
    }); };
}
function buildCustomOneFetchFn(clientOptions, parentPath, path, method) {
    var _this = this;
    return function (id, options) { return __awaiter(_this, void 0, void 0, function () {
        var url;
        var _a, _b;
        return __generator(this, function (_c) {
            url = "".concat((_a = clientOptions.rootPath) !== null && _a !== void 0 ? _a : '', "/").concat(parentPath, "/").concat(id, "/").concat(path);
            return [2 /*return*/, (makeRequest(clientOptions, url, {
                    method: method,
                    headers: __assign({}, ((_b = options === null || options === void 0 ? void 0 : options.headers) !== null && _b !== void 0 ? _b : {})),
                }))];
        });
    }); };
}
function buildCustomOneSubmitFn(clientOptions, parentPath, path, method) {
    var _this = this;
    return function (id, data, options) { return __awaiter(_this, void 0, void 0, function () {
        var url;
        var _a, _b;
        return __generator(this, function (_c) {
            url = "".concat((_a = clientOptions.rootPath) !== null && _a !== void 0 ? _a : '', "/").concat(parentPath, "/").concat(id, "/").concat(path);
            return [2 /*return*/, (makeRequest(clientOptions, url, {
                    method: method,
                    body: data,
                    headers: __assign({}, ((_b = options === null || options === void 0 ? void 0 : options.headers) !== null && _b !== void 0 ? _b : {})),
                }))];
        });
    }); };
}
function buildCustomManyFetchFn(clientOptions, parentPath, path, method) {
    var _this = this;
    return function (options) { return __awaiter(_this, void 0, void 0, function () {
        var url;
        var _a, _b;
        return __generator(this, function (_c) {
            url = "".concat((_a = clientOptions.rootPath) !== null && _a !== void 0 ? _a : '', "/").concat(parentPath, "/").concat(path);
            return [2 /*return*/, (makeRequest(clientOptions, url, {
                    method: method,
                    headers: __assign({}, ((_b = options === null || options === void 0 ? void 0 : options.headers) !== null && _b !== void 0 ? _b : {})),
                }))];
        });
    }); };
}
function buildCustomManySubmitFn(clientOptions, parentPath, path, method) {
    var _this = this;
    return function (data, options) { return __awaiter(_this, void 0, void 0, function () {
        var url;
        var _a, _b;
        return __generator(this, function (_c) {
            url = "".concat((_a = clientOptions.rootPath) !== null && _a !== void 0 ? _a : '', "/").concat(parentPath, "/").concat(path);
            return [2 /*return*/, (makeRequest(clientOptions, url, {
                    method: method,
                    body: data,
                    headers: __assign({}, ((_b = options === null || options === void 0 ? void 0 : options.headers) !== null && _b !== void 0 ? _b : {})),
                }))];
        });
    }); };
}
function makeRequest(options, url, init) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            if (options.requestFn == null) {
                throw new Error("Request function is required in API client");
            }
            return [2 /*return*/, options.requestFn(url, init).then(function (_a) {
                    var status = _a.status, data = _a.data, _b = _a.headers, headers = _b === void 0 ? {} : _b;
                    if (status >= 200 && status < 300) {
                        return {
                            kind: "success",
                            status: status,
                            headers: headers,
                            data: data,
                        };
                    }
                    else {
                        if (data == null) {
                            return {
                                kind: "error",
                                status: status,
                                headers: headers,
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
                                status: status,
                                headers: headers,
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
                                    status: status,
                                    headers: headers,
                                    error: data,
                                };
                            }
                            else {
                                return {
                                    kind: "error",
                                    status: status,
                                    headers: headers,
                                    error: {
                                        code: "ERROR_CODE_OTHER",
                                        message: "Unexpected error",
                                        data: data,
                                    },
                                    // TODO: fix response error type (TS complains about types not overlapping!?)
                                };
                            }
                        }
                    }
                })];
        });
    });
}

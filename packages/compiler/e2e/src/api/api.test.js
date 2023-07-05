"use strict";
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
var path_1 = require("path");
var dotenv = require("dotenv");
var supertest_1 = require("supertest");
var setup_1 = require("@compiler/e2e/api/setup");
// these tests last longer than default 5s timeout so this seems to help
jest.setTimeout(10000);
describe("API endpoints", function () {
    dotenv.config({ path: path_1.default.join(__dirname, "api.test.env") });
    var _a = (0, setup_1.createApiTestSetup)((0, setup_1.loadBlueprint)(path_1.default.join(__dirname, "api.model.gaudi")), (0, setup_1.loadPopulatorData)(path_1.default.join(__dirname, "api.data.json"))), getServer = _a.getServer, setup = _a.setup, destroy = _a.destroy;
    describe("Org", function () {
        beforeAll(function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, setup()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        afterAll(function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, destroy()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        // --- regular endpoints
        it("get", function () { return __awaiter(void 0, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, supertest_1.default)(getServer()).get("/api/org/org1")];
                    case 1:
                        response = _a.sent();
                        expect(response.statusCode).toBe(200);
                        expect(response.body).toMatchSnapshot();
                        return [2 /*return*/];
                }
            });
        }); });
        it("list with paging", function () { return __awaiter(void 0, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, supertest_1.default)(getServer()).get("/api/org")];
                    case 1:
                        response = _a.sent();
                        expect(response.statusCode).toBe(200);
                        expect(response.body).toMatchSnapshot();
                        return [2 /*return*/];
                }
            });
        }); });
        it("list with non default paging", function () { return __awaiter(void 0, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, supertest_1.default)(getServer()).get("/api/org?page=2&pageSize=2")];
                    case 1:
                        response = _a.sent();
                        expect(response.statusCode).toBe(200);
                        expect(response.body).toMatchSnapshot();
                        return [2 /*return*/];
                }
            });
        }); });
        it("create", function () { return __awaiter(void 0, void 0, void 0, function () {
            var data, postResp, getResp;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        data = {
                            name: "Org NEW",
                            slug: "orgNEW",
                            description: "Org NEW description",
                        };
                        return [4 /*yield*/, (0, supertest_1.default)(getServer()).post("/api/org").send(data)];
                    case 1:
                        postResp = _a.sent();
                        expect(postResp.statusCode).toBe(200);
                        return [4 /*yield*/, (0, supertest_1.default)(getServer()).get("/api/org/orgNEW")];
                    case 2:
                        getResp = _a.sent();
                        expect(getResp.statusCode).toBe(200);
                        expect(getResp.body).toMatchSnapshot();
                        // ensure `.get` result is the same as returned from `create` method
                        expect(getResp.body).toEqual(postResp.body);
                        return [2 /*return*/];
                }
            });
        }); });
        it("update", function () { return __awaiter(void 0, void 0, void 0, function () {
            var data, patchResp, getResp;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        data = { slug: "org2", name: "Org 2A", description: "Org 2A description" };
                        return [4 /*yield*/, (0, supertest_1.default)(getServer()).patch("/api/org/org2").send(data)];
                    case 1:
                        patchResp = _a.sent();
                        expect(patchResp.statusCode).toBe(200);
                        return [4 /*yield*/, (0, supertest_1.default)(getServer()).get("/api/org/org2")];
                    case 2:
                        getResp = _a.sent();
                        expect(getResp.statusCode).toBe(200);
                        expect(getResp.body).toMatchSnapshot();
                        // ensure `.get` result is the same as returned from `update` method
                        expect(getResp.body).toEqual(patchResp.body);
                        return [2 /*return*/];
                }
            });
        }); });
        it("delete", function () { return __awaiter(void 0, void 0, void 0, function () {
            var patchResp, getResp;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, supertest_1.default)(getServer()).delete("/api/org/org3")];
                    case 1:
                        patchResp = _a.sent();
                        expect(patchResp.statusCode).toBe(204);
                        return [4 /*yield*/, (0, supertest_1.default)(getServer()).get("/api/org/org3")];
                    case 2:
                        getResp = _a.sent();
                        expect(getResp.statusCode).toBe(404);
                        return [2 /*return*/];
                }
            });
        }); });
        // --- custom endpoints
        it("custom get", function () { return __awaiter(void 0, void 0, void 0, function () {
            var postResp;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, supertest_1.default)(getServer()).get("/api/org/org2/customGet").send()];
                    case 1:
                        postResp = _a.sent();
                        // custom endpoint return empty body so we can check only status
                        expect(postResp.statusCode).toBe(204);
                        return [2 /*return*/];
                }
            });
        }); });
        it("custom create", function () { return __awaiter(void 0, void 0, void 0, function () {
            var data, postResp, getResp;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        data = {
                            newOrg: {
                                name: "Org Custom NEW",
                                slug: "orgCustomNEW",
                                description: "Org custom NEW description",
                            },
                        };
                        return [4 /*yield*/, (0, supertest_1.default)(getServer()).post("/api/org/customCreate").send(data)];
                    case 1:
                        postResp = _a.sent();
                        expect(postResp.statusCode).toBe(204);
                        return [4 /*yield*/, (0, supertest_1.default)(getServer()).get("/api/org/orgCustomNEW")];
                    case 2:
                        getResp = _a.sent();
                        expect(getResp.statusCode).toBe(200);
                        expect(getResp.body).toMatchSnapshot();
                        return [2 /*return*/];
                }
            });
        }); });
        it("custom update", function () { return __awaiter(void 0, void 0, void 0, function () {
            var data, patchResp, getResp;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        data = {
                            newOrg: {
                                slug: "org2",
                                name: "Org custom 2A",
                                description: "Org custom 2A description",
                            },
                        };
                        return [4 /*yield*/, (0, supertest_1.default)(getServer()).patch("/api/org/org2/customUpdate").send(data)];
                    case 1:
                        patchResp = _a.sent();
                        expect(patchResp.statusCode).toBe(204);
                        return [4 /*yield*/, (0, supertest_1.default)(getServer()).get("/api/org/org2")];
                    case 2:
                        getResp = _a.sent();
                        expect(getResp.statusCode).toBe(200);
                        expect(getResp.body).toMatchSnapshot();
                        return [2 /*return*/];
                }
            });
        }); });
        // TODO: fix delete actions
        it("custom delete", function () { return __awaiter(void 0, void 0, void 0, function () {
            var patchResp, getResp;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, supertest_1.default)(getServer()).delete("/api/org/org4/customDelete")];
                    case 1:
                        patchResp = _a.sent();
                        expect(patchResp.statusCode).toBe(204);
                        return [4 /*yield*/, (0, supertest_1.default)(getServer()).get("/api/org/org4")];
                    case 2:
                        getResp = _a.sent();
                        expect(getResp.statusCode).toBe(404);
                        return [2 /*return*/];
                }
            });
        }); });
        it("custom list", function () { return __awaiter(void 0, void 0, void 0, function () {
            var postResp;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, supertest_1.default)(getServer()).get("/api/org/customList").send()];
                    case 1:
                        postResp = _a.sent();
                        // custom endpoint return empty body so we can check only status
                        expect(postResp.statusCode).toBe(204);
                        return [2 /*return*/];
                }
            });
        }); });
        // --- hook action
        it("custom one action", function () { return __awaiter(void 0, void 0, void 0, function () {
            var data, postResp;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        data = {
                            name: "Org Custom One",
                            counter: 1,
                            customProp: "custom prop value",
                        };
                        return [4 /*yield*/, (0, supertest_1.default)(getServer()).post("/api/org/org1/customOneAction").send(data)];
                    case 1:
                        postResp = _a.sent();
                        expect(postResp.statusCode).toBe(204);
                        // header should contain the same data sent we've sent
                        expect(postResp.get("Gaudi-Test-body")).toBe(JSON.stringify(data));
                        return [2 /*return*/];
                }
            });
        }); });
        it("custom many action", function () { return __awaiter(void 0, void 0, void 0, function () {
            var data, postResp;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        data = { name: "Org Custom Many", counter: 1 };
                        return [4 /*yield*/, (0, supertest_1.default)(getServer()).patch("/api/org/customManyAction").send(data)];
                    case 1:
                        postResp = _a.sent();
                        expect(postResp.statusCode).toBe(204);
                        // header should contain the same data sent we've sent
                        expect(postResp.get("Gaudi-Test-body")).toBe(JSON.stringify(data));
                        return [2 /*return*/];
                }
            });
        }); });
        // --- hook action that responds
        it("custom one endpoint - action responds", function () { return __awaiter(void 0, void 0, void 0, function () {
            var data, postResp;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        data = { name: "Org Custom One", counter: 1 };
                        return [4 /*yield*/, (0, supertest_1.default)(getServer())
                                .post("/api/org/org1/customOneActionResponds")
                                .send(data)];
                    case 1:
                        postResp = _a.sent();
                        expect(postResp.statusCode).toBe(200);
                        expect(postResp.body).toMatchInlineSnapshot("\n        {\n          \"counter\": 1,\n          \"name\": \"Org Custom One\",\n        }\n      ");
                        return [2 /*return*/];
                }
            });
        }); });
        it("custom many endpoint - action responds", function () { return __awaiter(void 0, void 0, void 0, function () {
            var data, postResp;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        data = { name: "Org Custom Many", counter: 1 };
                        return [4 /*yield*/, (0, supertest_1.default)(getServer())
                                .patch("/api/org/customManyActionResponds")
                                .send(data)];
                    case 1:
                        postResp = _a.sent();
                        expect(postResp.statusCode).toBe(200);
                        expect(postResp.body).toMatchInlineSnapshot("\n        {\n          \"counter\": 1,\n          \"name\": \"Org Custom Many\",\n        }\n      ");
                        return [2 /*return*/];
                }
            });
        }); });
        it("custom many endpoint - respond action with static response", function () { return __awaiter(void 0, void 0, void 0, function () {
            var postResp;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, supertest_1.default)(getServer())
                            .patch("/api/org/customManyRespondActionStatic")
                            .send()];
                    case 1:
                        postResp = _a.sent();
                        expect(postResp.statusCode).toBe(202);
                        expect(postResp.body).toMatchInlineSnapshot("\"static response body\"");
                        return [2 /*return*/];
                }
            });
        }); });
        it("custom many endpoint - respond action with simple response", function () { return __awaiter(void 0, void 0, void 0, function () {
            var data, postResp;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        data = {
                            body: "Org Custom Many Respond Simple",
                        };
                        return [4 /*yield*/, (0, supertest_1.default)(getServer())
                                .patch("/api/org/customManyRespondActionSimple")
                                .send(data)];
                    case 1:
                        postResp = _a.sent();
                        expect(postResp.statusCode).toBe(200); // default response code
                        expect(postResp.body).toMatchInlineSnapshot("\"Org Custom Many Respond Simple\"");
                        return [2 /*return*/];
                }
            });
        }); });
        it("custom many endpoint - respond action with complex response", function () { return __awaiter(void 0, void 0, void 0, function () {
            var data, postResp;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        data = {
                            prop1: "Org Custom Many Respond prop1",
                            prop2: 2,
                            statusCode: 201,
                            header1: "header 1",
                            header2: "header 2",
                        };
                        return [4 /*yield*/, (0, supertest_1.default)(getServer())
                                .patch("/api/org/customManyRespondActionComplex")
                                .send(data)];
                    case 1:
                        postResp = _a.sent();
                        expect(postResp.statusCode).toBe(201);
                        expect(postResp.body).toMatchInlineSnapshot("\n        {\n          \"prop1\": \"Org Custom Many Respond prop1\",\n          \"prop2\": 2,\n        }\n      ");
                        expect(postResp.get("header-1")).toBe(data.header1);
                        expect(postResp.get("header-2")).toBe(data.header2);
                        expect(postResp.headers["header-12"]).toBe("".concat(data.header1, ", ").concat(data.header2)); // multiple header values
                        expect(postResp.headers["header-3"]).toBe(undefined); // removed header
                        return [2 /*return*/];
                }
            });
        }); });
        // --- hook action with query
        it("custom one endpoint - action with query", function () { return __awaiter(void 0, void 0, void 0, function () {
            var data, postResp;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        data = { name: "Org 1", orgId: 1 };
                        return [4 /*yield*/, (0, supertest_1.default)(getServer())
                                .post("/api/org/org1/customOneQueryAction")
                                .send(data)];
                    case 1:
                        postResp = _a.sent();
                        expect(postResp.statusCode).toBe(200);
                        expect(postResp.body).toMatchSnapshot();
                        return [2 /*return*/];
                }
            });
        }); });
        it("custom endpoint - fetch action", function () { return __awaiter(void 0, void 0, void 0, function () {
            var data, postResp;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        data = { name: "Fetch me org 1" };
                        return [4 /*yield*/, (0, supertest_1.default)(getServer())
                                .post("/api/org/org1/customFetchAction")
                                .send(data)];
                    case 1:
                        postResp = _a.sent();
                        expect(postResp.statusCode).toBe(200);
                        expect(postResp.body).toMatchSnapshot();
                        return [2 /*return*/];
                }
            });
        }); });
        // --- hook error
        it("Hook throws specific HTTP error response", function () { return __awaiter(void 0, void 0, void 0, function () {
            var data, response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        data = { status: 451, code: "UNAVAILABLE", message: "Unavailable For Legal Reasons" };
                        return [4 /*yield*/, (0, supertest_1.default)(getServer()).post("/api/org/hookErrorResponse").send(data)];
                    case 1:
                        response = _a.sent();
                        expect(response.statusCode).toBe(data.status);
                        expect(response.text).toEqual(data.message);
                        return [2 /*return*/];
                }
            });
        }); });
        it("Hook throws generic HTTP error response", function () { return __awaiter(void 0, void 0, void 0, function () {
            var data, response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        data = {
                            message: "Custom error",
                            status: 505,
                        };
                        return [4 /*yield*/, (0, supertest_1.default)(getServer()).post("/api/org/hookErrorResponse").send(data)];
                    case 1:
                        response = _a.sent();
                        expect(response.statusCode).toBe(505);
                        expect(response.text).toBe("Custom error");
                        return [2 /*return*/];
                }
            });
        }); });
    });
    describe("Repo", function () {
        beforeAll(function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, setup()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        afterAll(function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, destroy()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        it("get", function () { return __awaiter(void 0, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, supertest_1.default)(getServer()).get("/api/org/org1/repos/1")];
                    case 1:
                        response = _a.sent();
                        expect(response.statusCode).toBe(200);
                        expect(response.body).toMatchSnapshot();
                        return [2 /*return*/];
                }
            });
        }); });
        it("list", function () { return __awaiter(void 0, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, supertest_1.default)(getServer()).get("/api/org/org1/repos")];
                    case 1:
                        response = _a.sent();
                        expect(response.statusCode).toBe(200);
                        expect(response.body).toMatchSnapshot();
                        return [2 /*return*/];
                }
            });
        }); });
        it("create", function () { return __awaiter(void 0, void 0, void 0, function () {
            var data, postResp, getResp;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        data = {
                            name: "Repo 6",
                            slug: "repo6",
                            raw_description: "Repo 6 description",
                            is_public: true,
                        };
                        return [4 /*yield*/, (0, supertest_1.default)(getServer()).post("/api/org/org1/repos").send(data)];
                    case 1:
                        postResp = _a.sent();
                        expect(postResp.statusCode).toBe(200);
                        return [4 /*yield*/, (0, supertest_1.default)(getServer()).get("/api/org/org1/repos/6")];
                    case 2:
                        getResp = _a.sent();
                        expect(getResp.statusCode).toBe(200);
                        expect(getResp.body).toMatchSnapshot();
                        return [2 /*return*/];
                }
            });
        }); });
        it("update", function () { return __awaiter(void 0, void 0, void 0, function () {
            var data, patchResp, getResp;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        data = { slug: "repo2", name: "Repo 2A", description: "Repo 2A description" };
                        return [4 /*yield*/, (0, supertest_1.default)(getServer()).patch("/api/org/org1/repos/2").send(data)];
                    case 1:
                        patchResp = _a.sent();
                        expect(patchResp.statusCode).toBe(200);
                        return [4 /*yield*/, (0, supertest_1.default)(getServer()).get("/api/org/org1/repos/2")];
                    case 2:
                        getResp = _a.sent();
                        expect(getResp.statusCode).toBe(200);
                        expect(getResp.body).toMatchSnapshot();
                        return [2 /*return*/];
                }
            });
        }); });
        it("delete", function () { return __awaiter(void 0, void 0, void 0, function () {
            var patchResp, getResp;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, supertest_1.default)(getServer()).delete("/api/org/org1/repos/1")];
                    case 1:
                        patchResp = _a.sent();
                        expect(patchResp.statusCode).toBe(204);
                        return [4 /*yield*/, (0, supertest_1.default)(getServer()).get("/api/org/org1/repos/1")];
                    case 2:
                        getResp = _a.sent();
                        expect(getResp.statusCode).toBe(404);
                        return [2 /*return*/];
                }
            });
        }); });
    });
    describe("Issue", function () {
        beforeAll(function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, setup()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        afterAll(function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, destroy()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        it("create", function () { return __awaiter(void 0, void 0, void 0, function () {
            var data, postResp, getResp;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        data = {
                            title: "Issue 1",
                            c: {
                                body: "Comment body",
                            },
                        };
                        return [4 /*yield*/, (0, supertest_1.default)(getServer()).post("/api/org/org1/repos/1/issues").send(data)];
                    case 1:
                        postResp = _a.sent();
                        expect(postResp.statusCode).toBe(200);
                        return [4 /*yield*/, (0, supertest_1.default)(getServer()).get("/api/org/org1/repos/1/issues/1")];
                    case 2:
                        getResp = _a.sent();
                        expect(getResp.statusCode).toBe(200);
                        expect(getResp.body).toMatchSnapshot();
                        return [2 /*return*/];
                }
            });
        }); });
    });
    describe("PublicRepo", function () {
        beforeAll(function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, setup()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        afterAll(function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, destroy()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        it("list", function () { return __awaiter(void 0, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, supertest_1.default)(getServer()).get("/api/repo")];
                    case 1:
                        response = _a.sent();
                        expect(response.statusCode).toBe(200);
                        expect(response.body).toMatchSnapshot();
                        return [2 /*return*/];
                }
            });
        }); });
    });
});

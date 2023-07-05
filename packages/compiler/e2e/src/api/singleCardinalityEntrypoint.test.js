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
describe("Single Cardinality Entrypoint", function () {
    dotenv.config({ path: path_1.default.join(__dirname, "api.test.env") });
    var _a = (0, setup_1.createApiTestSetup)((0, setup_1.loadBlueprint)(path_1.default.join(__dirname, "singleCardinalityEntrypoint.gaudi")), [
        { model: "Address", data: [{ name: "Address 1" }] },
        { model: "User", data: [{ name: "First", address_id: 1 }] },
    ]), getServer = _a.getServer, setup = _a.setup, destroy = _a.destroy;
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
    describe("cardinality one reference", function () {
        it("get", function () { return __awaiter(void 0, void 0, void 0, function () {
            var getResponse;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, supertest_1.default)(getServer()).get("/api/user/1/address")];
                    case 1:
                        getResponse = _a.sent();
                        expect(getResponse.statusCode).toBe(200);
                        expect(getResponse.body).toMatchSnapshot();
                        return [2 /*return*/];
                }
            });
        }); });
        it("update", function () { return __awaiter(void 0, void 0, void 0, function () {
            var data, patchResponse;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        data = { name: "Foo 2" };
                        return [4 /*yield*/, (0, supertest_1.default)(getServer()).patch("/api/user/1/address").send(data)];
                    case 1:
                        patchResponse = _a.sent();
                        expect(patchResponse.statusCode).toBe(200);
                        expect(patchResponse.body).toMatchSnapshot();
                        return [2 /*return*/];
                }
            });
        }); });
        it("custom", function () { return __awaiter(void 0, void 0, void 0, function () {
            var getResponse;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, supertest_1.default)(getServer()).get("/api/user/1/address/custom")];
                    case 1:
                        getResponse = _a.sent();
                        expect(getResponse.statusCode).toBe(204);
                        return [2 /*return*/];
                }
            });
        }); });
    });
    describe("cardinality nullable reference", function () {
        it("fail to delete when not existing", function () { return __awaiter(void 0, void 0, void 0, function () {
            var deleteResponse;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, supertest_1.default)(getServer()).delete("/api/user/1/details")];
                    case 1:
                        deleteResponse = _a.sent();
                        expect(deleteResponse.statusCode).toBe(404);
                        return [2 /*return*/];
                }
            });
        }); });
        it("create and delete", function () { return __awaiter(void 0, void 0, void 0, function () {
            var data, postResponse, getResponse1, deleteResponse, getResponse2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        data = { text: "some text" };
                        return [4 /*yield*/, (0, supertest_1.default)(getServer()).post("/api/user/1/details").send(data)];
                    case 1:
                        postResponse = _a.sent();
                        expect(postResponse.statusCode).toBe(200);
                        expect(postResponse.body).toMatchSnapshot();
                        return [4 /*yield*/, (0, supertest_1.default)(getServer()).get("/api/user/1")];
                    case 2:
                        getResponse1 = _a.sent();
                        expect(getResponse1.statusCode).toBe(200);
                        // Check if user.details is set from context
                        expect(getResponse1.body.details_id).toBe(postResponse.body.id);
                        return [4 /*yield*/, (0, supertest_1.default)(getServer()).delete("/api/user/1/details")];
                    case 3:
                        deleteResponse = _a.sent();
                        expect(deleteResponse.statusCode).toBe(204);
                        return [4 /*yield*/, (0, supertest_1.default)(getServer()).get("/api/user/1")];
                    case 4:
                        getResponse2 = _a.sent();
                        expect(getResponse2.statusCode).toBe(200);
                        // Check if user.details is unset
                        expect(getResponse2.body.details_id).toBeNull();
                        return [2 /*return*/];
                }
            });
        }); });
    });
    describe("cardinality nullable relation", function () {
        it("get", function () { return __awaiter(void 0, void 0, void 0, function () {
            var getResponse;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, supertest_1.default)(getServer()).get("/api/address/1/user")];
                    case 1:
                        getResponse = _a.sent();
                        expect(getResponse.statusCode).toBe(200);
                        expect(getResponse.body).toMatchSnapshot();
                        return [2 /*return*/];
                }
            });
        }); });
        it("update", function () { return __awaiter(void 0, void 0, void 0, function () {
            var data, patchResponse;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        data = { name: "Second" };
                        return [4 /*yield*/, (0, supertest_1.default)(getServer()).patch("/api/address/1/user").send(data)];
                    case 1:
                        patchResponse = _a.sent();
                        expect(patchResponse.statusCode).toBe(200);
                        expect(patchResponse.body).toMatchSnapshot();
                        return [2 /*return*/];
                }
            });
        }); });
        it("custom", function () { return __awaiter(void 0, void 0, void 0, function () {
            var getResponse;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, supertest_1.default)(getServer()).get("/api/address/1/user/custom")];
                    case 1:
                        getResponse = _a.sent();
                        expect(getResponse.statusCode).toBe(204);
                        return [2 /*return*/];
                }
            });
        }); });
        it("delete and create", function () { return __awaiter(void 0, void 0, void 0, function () {
            var deleteResponse, data, postResponse;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, supertest_1.default)(getServer()).delete("/api/address/1/user")];
                    case 1:
                        deleteResponse = _a.sent();
                        expect(deleteResponse.statusCode).toBe(204);
                        data = { name: "Second" };
                        return [4 /*yield*/, (0, supertest_1.default)(getServer()).post("/api/address/1/user").send(data)];
                    case 2:
                        postResponse = _a.sent();
                        expect(postResponse.statusCode).toBe(200);
                        expect(postResponse.body).toMatchSnapshot();
                        return [2 /*return*/];
                }
            });
        }); });
        it("fail to create when already existing", function () { return __awaiter(void 0, void 0, void 0, function () {
            var data, postResponse;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        data = { name: "Third" };
                        return [4 /*yield*/, (0, supertest_1.default)(getServer()).post("/api/address/1/user").send(data)];
                    case 1:
                        postResponse = _a.sent();
                        expect(postResponse.statusCode).toBe(500); // FIXME response with better data
                        return [2 /*return*/];
                }
            });
        }); });
        it("fail to delete when not existing", function () { return __awaiter(void 0, void 0, void 0, function () {
            var delete1Response, delete2Response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, supertest_1.default)(getServer()).delete("/api/address/1/user")];
                    case 1:
                        delete1Response = _a.sent();
                        expect(delete1Response.statusCode).toBe(204);
                        return [4 /*yield*/, (0, supertest_1.default)(getServer()).delete("/api/address/1/user")];
                    case 2:
                        delete2Response = _a.sent();
                        expect(delete2Response.statusCode).toBe(404);
                        return [2 /*return*/];
                }
            });
        }); });
    });
});

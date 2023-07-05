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
var auth_data_1 = require("@compiler/e2e/api/auth.data");
var setup_1 = require("@compiler/e2e/api/setup");
// these tests last longer than default 5s timeout so this seems to help
jest.setTimeout(60000);
describe("Auth", function () {
    dotenv.config({ path: path_1.default.join(__dirname, "api.test.env") });
    var _a = (0, setup_1.createApiTestSetup)((0, setup_1.loadBlueprint)(path_1.default.join(__dirname, "auth.model.gaudi")), auth_data_1.DATA), getServer = _a.getServer, setup = _a.setup, destroy = _a.destroy;
    function loginOwner() {
        return __awaiter(this, void 0, void 0, function () {
            var loginResponse;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, supertest_1.default)(getServer())
                            .post("/api/auth/auth_user/login")
                            .send({ username: "first", password: "1234" })];
                    case 1:
                        loginResponse = _a.sent();
                        return [2 /*return*/, loginResponse.body.token];
                }
            });
        });
    }
    function loginAnotherUser() {
        return __awaiter(this, void 0, void 0, function () {
            var loginResponse;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, supertest_1.default)(getServer())
                            .post("/api/auth/auth_user/login")
                            .send({ username: "second", password: "1234" })];
                    case 1:
                        loginResponse = _a.sent();
                        return [2 /*return*/, loginResponse.body.token];
                }
            });
        });
    }
    describe("Login and Logout", function () {
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
        it("Login and Logout successfully", function () { return __awaiter(void 0, void 0, void 0, function () {
            var listResponse1, loginResponse, token, listResponse2, logoutResponse, listResponse3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, supertest_1.default)(getServer()).get("/api/box")];
                    case 1:
                        listResponse1 = _a.sent();
                        expect(listResponse1.statusCode).toBe(401);
                        return [4 /*yield*/, (0, supertest_1.default)(getServer())
                                .post("/api/auth/auth_user/login")
                                .send({ username: "first", password: "1234" })];
                    case 2:
                        loginResponse = _a.sent();
                        expect(loginResponse.statusCode).toBe(200);
                        token = loginResponse.body.token;
                        expect(token === null || token === void 0 ? void 0 : token.length).toBe(43);
                        return [4 /*yield*/, (0, supertest_1.default)(getServer())
                                .get("/api/box")
                                .set("Authorization", "bearer " + token)];
                    case 3:
                        listResponse2 = _a.sent();
                        expect(listResponse2.statusCode).toBe(200);
                        return [4 /*yield*/, (0, supertest_1.default)(getServer())
                                .post("/api/auth/auth_user/logout")
                                .set("Authorization", "bearer " + token)];
                    case 4:
                        logoutResponse = _a.sent();
                        expect(logoutResponse.statusCode).toBe(204);
                        return [4 /*yield*/, (0, supertest_1.default)(getServer())
                                .get("/api/box")
                                .set("Authorization", "bearer " + token)];
                    case 5:
                        listResponse3 = _a.sent();
                        expect(listResponse3.statusCode).toBe(401);
                        return [2 /*return*/];
                }
            });
        }); });
        it("Wrong Login password", function () { return __awaiter(void 0, void 0, void 0, function () {
            var loginResponse;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, supertest_1.default)(getServer())
                            .post("/api/auth/auth_user/login")
                            .send({ username: "first", password: "wrong password" })];
                    case 1:
                        loginResponse = _a.sent();
                        expect(loginResponse.statusCode).toBe(401);
                        return [2 /*return*/];
                }
            });
        }); });
        it("Wrong Login username", function () { return __awaiter(void 0, void 0, void 0, function () {
            var loginResponse;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, supertest_1.default)(getServer())
                            .post("/api/auth/auth_user/login")
                            .send({ username: "wrong username", password: "1234" })];
                    case 1:
                        loginResponse = _a.sent();
                        // TODO: fix in plugin to return 401
                        expect(loginResponse.statusCode).toBe(500);
                        return [2 /*return*/];
                }
            });
        }); });
        it("Return auth token in response", function () { return __awaiter(void 0, void 0, void 0, function () {
            var authToken, listResponse2;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        authToken = "FwExbO7sVwf95pI3F3qWSpkANE4aeoNiI0pogqiMcfQ";
                        return [4 /*yield*/, (0, supertest_1.default)(getServer())
                                .post("/api/box/fetchAuthToken")
                                // send token in header
                                .set("Authorization", "bearer " + authToken)
                                .send({})];
                    case 1:
                        listResponse2 = _b.sent();
                        expect(listResponse2.statusCode).toBe(200);
                        // expect the same token in response
                        expect((_a = listResponse2.body) === null || _a === void 0 ? void 0 : _a.token).toBe(authToken);
                        return [2 /*return*/];
                }
            });
        }); });
    });
    describe("Authorize rules in endpoints", function () {
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
        it("Success public", function () { return __awaiter(void 0, void 0, void 0, function () {
            var token, getResponse;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, loginOwner()];
                    case 1:
                        token = _a.sent();
                        return [4 /*yield*/, (0, supertest_1.default)(getServer())
                                .get("/api/box/public")
                                .set("Authorization", "bearer " + token)];
                    case 2:
                        getResponse = _a.sent();
                        expect(getResponse.statusCode).toBe(200);
                        return [2 /*return*/];
                }
            });
        }); });
        it("Success private owned", function () { return __awaiter(void 0, void 0, void 0, function () {
            var token, getResponse;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, loginOwner()];
                    case 1:
                        token = _a.sent();
                        return [4 /*yield*/, (0, supertest_1.default)(getServer())
                                .get("/api/box/private")
                                .set("Authorization", "bearer " + token)];
                    case 2:
                        getResponse = _a.sent();
                        expect(getResponse.statusCode).toBe(200);
                        return [2 /*return*/];
                }
            });
        }); });
        it("Fail private", function () { return __awaiter(void 0, void 0, void 0, function () {
            var token, getResponse;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, loginAnotherUser()];
                    case 1:
                        token = _a.sent();
                        return [4 /*yield*/, (0, supertest_1.default)(getServer())
                                .get("/api/box/private")
                                .set("Authorization", "bearer " + token)];
                    case 2:
                        getResponse = _a.sent();
                        expect(getResponse.statusCode).toBe(403);
                        return [2 /*return*/];
                }
            });
        }); });
        it("Fail private no auth", function () { return __awaiter(void 0, void 0, void 0, function () {
            var getResponse;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, supertest_1.default)(getServer()).get("/api/box/private")];
                    case 1:
                        getResponse = _a.sent();
                        expect(getResponse.statusCode).toBe(401);
                        return [2 /*return*/];
                }
            });
        }); });
        it("Success create box", function () { return __awaiter(void 0, void 0, void 0, function () {
            var token, getResponse;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, loginAnotherUser()];
                    case 1:
                        token = _a.sent();
                        return [4 /*yield*/, (0, supertest_1.default)(getServer())
                                .post("/api/box")
                                .set("Authorization", "bearer " + token)
                                .send({ name: "new box", is_public: false })];
                    case 2:
                        getResponse = _a.sent();
                        expect(getResponse.statusCode).toBe(200);
                        return [2 /*return*/];
                }
            });
        }); });
        it("Fail create box not logged in", function () { return __awaiter(void 0, void 0, void 0, function () {
            var getResponse;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, supertest_1.default)(getServer())
                            .post("/api/box")
                            .send({ name: "another box", is_public: false })];
                    case 1:
                        getResponse = _a.sent();
                        expect(getResponse.statusCode).toBe(401);
                        return [2 /*return*/];
                }
            });
        }); });
    });
    describe("Authorize rules inheritance from entrypoints", function () {
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
        /**
         * Only items from public boxes (regardless of ownership) can be requested.
         * `list` additionally expects ownership.
         */
        it("Fail private box > get public owned", function () { return __awaiter(void 0, void 0, void 0, function () {
            var token, getResponse;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, loginOwner()];
                    case 1:
                        token = _a.sent();
                        return [4 /*yield*/, (0, supertest_1.default)(getServer())
                                .get("/api/box/private/items/public2")
                                .set("Authorization", "bearer " + token)];
                    case 2:
                        getResponse = _a.sent();
                        expect(getResponse.statusCode).toBe(403);
                        return [2 /*return*/];
                }
            });
        }); });
        it("Success public box > get private", function () { return __awaiter(void 0, void 0, void 0, function () {
            var token, getResponse;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, loginAnotherUser()];
                    case 1:
                        token = _a.sent();
                        return [4 /*yield*/, (0, supertest_1.default)(getServer())
                                .get("/api/box/public/items/private")
                                .set("Authorization", "bearer " + token)];
                    case 2:
                        getResponse = _a.sent();
                        expect(getResponse.statusCode).toBe(200);
                        return [2 /*return*/];
                }
            });
        }); });
        it("Success public box > list owned", function () { return __awaiter(void 0, void 0, void 0, function () {
            var token, getResponse;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, loginOwner()];
                    case 1:
                        token = _a.sent();
                        return [4 /*yield*/, (0, supertest_1.default)(getServer())
                                .get("/api/box/public/items/")
                                .set("Authorization", "bearer " + token)];
                    case 2:
                        getResponse = _a.sent();
                        expect(getResponse.statusCode).toBe(200);
                        return [2 /*return*/];
                }
            });
        }); });
        it("Fail public box > list", function () { return __awaiter(void 0, void 0, void 0, function () {
            var token, getResponse;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, loginAnotherUser()];
                    case 1:
                        token = _a.sent();
                        return [4 /*yield*/, (0, supertest_1.default)(getServer())
                                .get("/api/box/public/items/")
                                .set("Authorization", "bearer " + token)];
                    case 2:
                        getResponse = _a.sent();
                        expect(getResponse.statusCode).toBe(403);
                        return [2 /*return*/];
                }
            });
        }); });
        it("Fail public box > list not logged in returns 401", function () { return __awaiter(void 0, void 0, void 0, function () {
            var getResponse;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, supertest_1.default)(getServer()).get("/api/box/public/items/")];
                    case 1:
                        getResponse = _a.sent();
                        expect(getResponse.statusCode).toBe(401);
                        return [2 /*return*/];
                }
            });
        }); });
    });
    describe("user registration", function () {
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
        it("should register and login new user", function () { return __awaiter(void 0, void 0, void 0, function () {
            var registerResponse, loginResponse;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, supertest_1.default)(getServer())
                            .post("/api/auth/auth_user/register")
                            .send({
                            password: "some password",
                            authUser: {
                                name: "some name",
                                username: "somename@example.com",
                                userProfile: { displayName: "Profile Display Name" },
                            },
                        })];
                    case 1:
                        registerResponse = _a.sent();
                        expect(registerResponse.statusCode).toBe(201);
                        expect(registerResponse.body).toMatchSnapshot();
                        return [4 /*yield*/, (0, supertest_1.default)(getServer())
                                .post("/api/auth/auth_user/login")
                                .send({ username: "somename@example.com", password: "some password" })];
                    case 2:
                        loginResponse = _a.sent();
                        expect(loginResponse.statusCode).toBe(200);
                        return [2 /*return*/];
                }
            });
        }); });
        it("should fail when creating user with invalid parameters", function () { return __awaiter(void 0, void 0, void 0, function () {
            var registerResponse;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, (0, supertest_1.default)(getServer())
                            .post("/api/auth/auth_user/register")
                            .send({ name: "", username: "", password: "" })];
                    case 1:
                        registerResponse = _b.sent();
                        expect(registerResponse.statusCode).toBe(400);
                        expect((_a = registerResponse.body) === null || _a === void 0 ? void 0 : _a.code).toMatchInlineSnapshot("\"ERROR_CODE_VALIDATION\"");
                        return [2 /*return*/];
                }
            });
        }); });
        it("should fail when creating user with existing username", function () { return __awaiter(void 0, void 0, void 0, function () {
            var data, reregisterReponse;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        data = {
                            password: "some password",
                            authUser: {
                                name: "some name",
                                username: "somename@example.com",
                                userProfile: { displayName: "Profile Display Name" },
                            },
                        };
                        return [4 /*yield*/, (0, supertest_1.default)(getServer()).post("/api/auth/auth_user/register").send(data)];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, (0, supertest_1.default)(getServer())
                                .post("/api/auth/auth_user/register")
                                .send(data)];
                    case 2:
                        reregisterReponse = _a.sent();
                        // FIXME this should be a validation error instead, but we don't handle unique constraints yet
                        expect(reregisterReponse.statusCode).toBe(500);
                        return [2 /*return*/];
                }
            });
        }); });
    });
});

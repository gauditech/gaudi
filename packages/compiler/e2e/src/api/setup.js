"use strict";
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
exports.createApiTestSetup = exports.loadPopulatorData = exports.loadBlueprint = void 0;
var child_process_1 = require("child_process");
var fs_1 = require("fs");
var os_1 = require("os");
var path_1 = require("path");
var express_1 = require("express");
var lodash_1 = require("lodash");
var builder_1 = require("@compiler/builder/builder");
var refs_1 = require("@compiler/common/refs");
var testUtils_1 = require("@runtime/common/testUtils");
var config_1 = require("@runtime/config");
var api_1 = require("@runtime/server/api");
var context_1 = require("@runtime/server/context");
var dbConn_1 = require("@runtime/server/dbConn");
var middleware_1 = require("@runtime/server/middleware");
/** Load definition file and return it's content */
function loadBlueprint(filePath) {
    if (!fs_1.default.existsSync(filePath)) {
        throw new Error("Blueprint file not found: \"".concat(filePath, "\""));
    }
    return fs_1.default.readFileSync(filePath).toString("utf-8");
}
exports.loadBlueprint = loadBlueprint;
/** Load populator data rom JSON and parse it to object */
function loadPopulatorData(filePath) {
    try {
        if (!fs_1.default.existsSync(filePath)) {
            throw new Error("Populator data file not found: \"".concat(filePath, "\""));
        }
        var fileContent = fs_1.default.readFileSync(filePath).toString("utf-8");
        return JSON.parse(fileContent);
    }
    catch (err) {
        if (err instanceof SyntaxError) {
            throw new Error("Populator data is not valid: ".concat(err.message));
        }
        else {
            throw err;
        }
    }
}
exports.loadPopulatorData = loadPopulatorData;
function createApiTestSetup(blueprint, data) {
    var config = (0, config_1.readConfig)();
    var server;
    // test context
    var schemaName;
    var outputFolder;
    var context;
    /** Setup test env for execution. Call before running tests. */
    function setupApiTest() {
        return __awaiter(this, void 0, void 0, function () {
            var def;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        // setup app context
                        schemaName = generateSchemaName();
                        context = {
                            config: config,
                            dbConn: (0, dbConn_1.createDbConn)(config.dbConnUrl, { schema: schemaName }),
                        };
                        console.info("Setup API tests (\"".concat(schemaName, "\")"));
                        // setup folders
                        outputFolder = createOutputFolder(schemaName);
                        console.info("  created output folder ".concat(outputFolder));
                        return [4 /*yield*/, buildDefinition(blueprint, outputFolder)];
                    case 1:
                        def = _a.sent();
                        console.info("  created definition");
                        // setup DB
                        return [4 /*yield*/, createDbSchema(context.dbConn, schemaName)];
                    case 2:
                        // setup DB
                        _a.sent();
                        console.info("  created DB schema");
                        return [4 /*yield*/, initializeDb(context.config.dbConnUrl, schemaName, path_1.default.join(outputFolder, "db/schema.prisma"))];
                    case 3:
                        _a.sent();
                        console.info("  initialized DB");
                        return [4 /*yield*/, populateDb(def, context.dbConn, data)];
                    case 4:
                        _a.sent();
                        console.info("  populated DB");
                        return [4 /*yield*/, createAppServer(context, function (app) {
                                (0, context_1.bindAppContext)(app, context);
                                (0, api_1.setupDefinitionApis)(def, app);
                            })];
                    case 5:
                        // setup server
                        server = _a.sent();
                        console.info("  created app server");
                        console.info("API tests setup finished");
                        return [2 /*return*/, {
                                schemaName: schemaName,
                                outputFolder: outputFolder,
                            }];
                }
            });
        });
    }
    /** Cleanup test exec env. Call after running tests. */
    function destroyApiTest() {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.info("Destroy API tests (\"".concat(schemaName, "\")"));
                        if (!server) return [3 /*break*/, 2];
                        return [4 /*yield*/, closeAppServer(server)];
                    case 1:
                        _a.sent();
                        console.info("  closed app server");
                        _a.label = 2;
                    case 2: return [4 /*yield*/, removeDbSchema(context.dbConn, schemaName)];
                    case 3:
                        _a.sent();
                        console.info("  removed DB schema");
                        context.dbConn.destroy();
                        console.info("  closed DB conn");
                        removeOutputFolder(outputFolder);
                        console.info("  removed output folder");
                        console.info("API tests destroy finished");
                        return [2 /*return*/];
                }
            });
        });
    }
    return {
        getServer: function () {
            if (server == null)
                throw new Error("Test HTTP server not yet started");
            return server;
        },
        setup: setupApiTest,
        destroy: destroyApiTest,
    };
}
exports.createApiTestSetup = createApiTestSetup;
// ----- schema name
var schemeCounter = 0; // simple schema sequence
function generateSchemaName() {
    return "test-".concat(process.pid, "-").concat(schemeCounter++);
}
// ----- folders
function createOutputFolder(name) {
    var folderPath = path_1.default.join(os_1.default.tmpdir(), "gaudi-".concat(name)); // TODO: get system tmp path and create subfolder
    // clear output folder
    if (!fs_1.default.existsSync(folderPath)) {
        // (re)create output folder
        fs_1.default.mkdirSync(folderPath, { recursive: true });
    }
    return folderPath;
}
function removeOutputFolder(path) {
    if (fs_1.default.existsSync(path)) {
        // (re)create output folder
        fs_1.default.rmSync(path, { recursive: true });
    }
}
// ----- gaudi definition
function buildDefinition(blueprint, outputFolder) {
    return __awaiter(this, void 0, void 0, function () {
        var definition;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    definition = (0, testUtils_1.compileFromString)(blueprint);
                    // use output folder for both regular output and gaudi for simpler testing
                    return [4 /*yield*/, (0, builder_1.build)(definition, { outputFolder: outputFolder, gaudiFolder: outputFolder })];
                case 1:
                    // use output folder for both regular output and gaudi for simpler testing
                    _a.sent();
                    return [2 /*return*/, definition];
            }
        });
    });
}
// ----- DB
function createDbSchema(dbConn, schema) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, removeDbSchema(dbConn, schema)];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, dbConn.schema.createSchema(schema)];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function removeDbSchema(dbConn, schema) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbConn.schema.dropSchemaIfExists(schema, true)];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function initializeDb(dbConnUrl, schema, definitionPath) {
    return __awaiter(this, void 0, void 0, function () {
        var url, prismaDbUrl;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    url = new URL(dbConnUrl);
                    // append DB schema param
                    url.searchParams.set("schema", schema);
                    prismaDbUrl = url.toString();
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            (0, child_process_1.exec)("npx prisma db push --schema ".concat(definitionPath), {
                                env: __assign(__assign({}, process.env), { GAUDI_DATABASE_URL: prismaDbUrl }),
                            }, function (err) {
                                if (err) {
                                    reject(err);
                                }
                                else {
                                    resolve(null);
                                }
                            });
                        })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function populateDb(def, dbConn, data) {
    return __awaiter(this, void 0, void 0, function () {
        var _i, data_1, populatorData;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _i = 0, data_1 = data;
                    _a.label = 1;
                case 1:
                    if (!(_i < data_1.length)) return [3 /*break*/, 4];
                    populatorData = data_1[_i];
                    return [4 /*yield*/, insertBatchQuery(def, dbConn, populatorData.model, populatorData.data)];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function insertBatchQuery(def, dbConn, refKey, data) {
    return __awaiter(this, void 0, void 0, function () {
        var model, dbData;
        return __generator(this, function (_a) {
            model = refs_1.getRef.model(def, refKey);
            dbData = data.map(function (d) { return (0, refs_1.dataToFieldDbnames)(model, d); });
            return [2 /*return*/, dbConn.batchInsert(model.dbname, dbData).returning("id")];
        });
    });
}
// ----- app server
function createAppServer(ctx, configure) {
    return __awaiter(this, void 0, void 0, function () {
        var app;
        return __generator(this, function (_a) {
            app = (0, express_1.default)();
            app.use((0, middleware_1.bindAppContextHandler)(app, ctx));
            app.use((0, express_1.json)());
            app.use(middleware_1.requestLogger);
            configure(app);
            app.use(middleware_1.errorHandler);
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    try {
                        var server_1 = app.listen(function () {
                            var serverAddress = server_1.address();
                            console.log("  server started on ".concat(serverAddress == null || lodash_1.default.isString(serverAddress)
                                ? serverAddress
                                : "".concat(serverAddress.address, ":").concat(serverAddress.port)));
                            resolve(server_1);
                        });
                    }
                    catch (err) {
                        reject(err);
                    }
                })];
        });
    });
}
function closeAppServer(server) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, new Promise(function (resolve, reject) {
                        server.close(function (err) {
                            if (err) {
                                reject(err);
                            }
                            resolve(undefined);
                        });
                    })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}

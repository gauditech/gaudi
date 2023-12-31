import path from "path";

import { RequiredOptional } from "@gaudi/compiler/dist/common/utils";
import * as dotenv from "dotenv";

import { RuntimeConfig, readConfig } from "@runtime/config";

describe("runtime", () => {
  describe("config", () => {
    const ORIGINAL_ENV = process.env; // Make a copy

    beforeEach(() => {
      jest.resetModules(); // clear cache
      process.env = { ...ORIGINAL_ENV }; // copy original env
    });

    afterEach(() => {
      process.env = ORIGINAL_ENV; // restore original env
    });

    it("provide default configuration", () => {
      const config: RuntimeConfig = readConfig();

      const expected: RequiredOptional<RuntimeConfig> = {
        dbConnUrl: "",
        host: "127.0.0.1",
        port: 3001,
        definitionPath: "dist/definition.json",
        outputDirectory: "dist",
        cors: undefined,
      };

      expect(config).toEqual(expected);
    });

    it("provide custom configuration from environment", () => {
      process.env.GAUDI_DATABASE_URL = "my://connection@string/";
      process.env.GAUDI_DATABASE_SCHEMA = "test-schema";
      process.env.GAUDI_RUNTIME_SERVER_HOST = "test-host";
      process.env.GAUDI_RUNTIME_SERVER_PORT = "31337";
      process.env.GAUDI_RUNTIME_DEFINITION_PATH = "test/definition/path";
      process.env.GAUDI_RUNTIME_OUTPUT_PATH = "test/output/path";
      process.env.GAUDI_CORS_ORIGIN = "test.origin";

      const config: RuntimeConfig = readConfig();

      const expected: RequiredOptional<RuntimeConfig> = {
        dbConnUrl: "my://connection@string/",
        host: "test-host",
        port: 31337,
        definitionPath: "test/definition/path",
        outputDirectory: "test/output/path",
        cors: { origin: ["test.origin"] },
      };

      expect(config).toEqual(expected);
    });

    it("should read values from config file", () => {
      dotenv.config({ path: path.join(__dirname, "config.test.env") });
      const config = readConfig();

      const expected: RequiredOptional<RuntimeConfig> = {
        dbConnUrl: "file-my://connection@string/",
        host: "file-test-host",
        port: 31337000,
        definitionPath: "file-test/definition/path",
        outputDirectory: "file-test/output/path",
        cors: { origin: ["test.origin"] },
      };

      expect(config).toEqual(expected);
    });

    it("should allow overriding config file values with custom values from environment", () => {
      process.env.GAUDI_DATABASE_URL = "my://connection@string/";
      process.env.GAUDI_DATABASE_SCHEMA = "test-schema";
      process.env.GAUDI_RUNTIME_SERVER_HOST = "test-host";
      process.env.GAUDI_RUNTIME_SERVER_PORT = "31337";
      process.env.GAUDI_RUNTIME_DEFINITION_PATH = "test/definition/path";
      process.env.GAUDI_RUNTIME_OUTPUT_PATH = "test/output/path";
      process.env.GAUDI_CORS_ORIGIN = "*";

      dotenv.config({ path: path.join(__dirname, "config.test.env") });
      const config = readConfig();

      const expected: RequiredOptional<RuntimeConfig> = {
        dbConnUrl: "my://connection@string/",
        host: "test-host",
        port: 31337,
        definitionPath: "test/definition/path",
        outputDirectory: "test/output/path",
        cors: { origin: true },
      };

      expect(config).toEqual(expected);
    });
  });
});

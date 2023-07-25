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
        dbSchema: "public",
        host: "127.0.0.1",
        port: 3001,
        definitionPath: "definition.json",
        outputFolder: ".",
        basePath: undefined,
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

      const config: RuntimeConfig = readConfig();

      const expected: RequiredOptional<RuntimeConfig> = {
        dbConnUrl: "my://connection@string/",
        dbSchema: "test-schema",
        host: "test-host",
        port: 31337,
        definitionPath: "test/definition/path",
        outputFolder: "test/output/path",
        basePath: undefined,
      };

      expect(config).toEqual(expected);
    });

    it("should read values from config file", () => {
      dotenv.config({ path: path.join(__dirname, "config.test.env") });
      const config = readConfig();

      const expected: RequiredOptional<RuntimeConfig> = {
        dbConnUrl: "file-my://connection@string/",
        dbSchema: "file-test-schema",
        host: "file-test-host",
        port: 31337000,
        definitionPath: "file-test/definition/path",
        outputFolder: "file-test/output/path",
        basePath: undefined,
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

      dotenv.config({ path: path.join(__dirname, "config.test.env") });
      const config = readConfig();

      const expected: RequiredOptional<RuntimeConfig> = {
        dbConnUrl: "my://connection@string/",
        dbSchema: "test-schema",
        host: "test-host",
        port: 31337,
        definitionPath: "test/definition/path",
        outputFolder: "test/output/path",
        basePath: undefined,
      };

      expect(config).toEqual(expected);
    });
  });
});

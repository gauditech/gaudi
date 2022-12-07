import path from "path";

import { RuntimeConfig, readConfig } from "@src/runtime/config";

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

      expect(config).toEqual({
        dbConnUrl: "",
        dbSchema: "public",
        host: "127.0.0.1",
        port: 3001,
        definitionPath: "definition.json",
        outputFolder: ".",
      } as RuntimeConfig);
    });

    it("provide custom configuration from environment", () => {
      process.env.GAUDI_DATABASE_URL = "my://connection@string/";
      process.env.GAUDI_DATABASE_SCHEMA = "test-schema";
      process.env.GAUDI_RUNTIME_SERVER_HOST = "test-host";
      process.env.GAUDI_RUNTIME_SERVER_PORT = "31337";
      process.env.GAUDI_RUNTIME_DEFINITION_PATH = "test/definition/path";
      process.env.GAUDI_RUNTIME_OUTPUT_PATH = "test/output/path";

      const config: RuntimeConfig = readConfig();

      expect(config).toEqual({
        dbConnUrl: "my://connection@string/",
        dbSchema: "test-schema",
        host: "test-host",
        port: 31337,
        definitionPath: "test/definition/path",
        outputFolder: "test/output/path",
      } as RuntimeConfig);
    });

    it("should reads values from config file", () => {
      const config = readConfig(path.join(__dirname, "config.test.env"));

      expect(config).toEqual({
        dbConnUrl: "file-my://connection@string/",
        dbSchema: "file-test-schema",
        host: "file-test-host",
        port: 31337000,
        definitionPath: "file-test/definition/path",
        outputFolder: "file-test/output/path",
      } as RuntimeConfig);
    });

    it("should allow overriding config file values with custom values from environment", () => {
      process.env.GAUDI_DATABASE_URL = "my://connection@string/";
      process.env.GAUDI_DATABASE_SCHEMA = "test-schema";
      process.env.GAUDI_RUNTIME_SERVER_HOST = "test-host";
      process.env.GAUDI_RUNTIME_SERVER_PORT = "31337";
      process.env.GAUDI_RUNTIME_DEFINITION_PATH = "test/definition/path";
      process.env.GAUDI_RUNTIME_OUTPUT_PATH = "test/output/path";

      const config = readConfig(path.join(__dirname, "config.test.env"));

      expect(config).toEqual({
        dbConnUrl: "my://connection@string/",
        dbSchema: "test-schema",
        host: "test-host",
        port: 31337,
        definitionPath: "test/definition/path",
        outputFolder: "test/output/path",
      } as RuntimeConfig);
    });
  });
});

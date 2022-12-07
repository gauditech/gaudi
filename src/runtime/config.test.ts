import { RuntimeConfig, readConfig } from "@src/runtime/config";

describe("runtime", () => {
  describe("config", () => {
    it("provide default configuration", () => {
      const config: RuntimeConfig = readConfig();

      expect(config).toEqual({
        dbConnUrl: "",
        dbSchema: "public",
        host: "127.0.0.1",
        port: 3001,
        definitionPath: "definition.json",
        outputFolder: ".",
        hookFolder: ".",
      } as RuntimeConfig);
    });

    it("provide custom configuration from environment", () => {
      process.env.GAUDI_DATABASE_URL = "my://connection@string/";
      process.env.GAUDI_DATABASE_SCHEMA = "test-schema";
      process.env.GAUDI_RUNTIME_SERVER_HOST = "test-host";
      process.env.GAUDI_RUNTIME_SERVER_PORT = "31337";
      process.env.GAUDI_RUNTIME_DEFINITION_PATH = "test/definition/path";
      process.env.GAUDI_RUNTIME_OUTPUT_PATH = "test/output/path";
      process.env.GAUDI_RUNTIME_HOOK_PATH = "test/hook/path";

      const config: RuntimeConfig = readConfig();

      expect(config).toEqual({
        dbConnUrl: "my://connection@string/",
        dbSchema: "test-schema",
        host: "test-host",
        port: 31337,
        definitionPath: "test/definition/path",
        outputFolder: "test/output/path",
        hookFolder: "test/hook/path",
      } as RuntimeConfig);
    });
  });
});

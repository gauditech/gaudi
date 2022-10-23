import { readConfig } from "@src/runtime/config";

describe("runtime", () => {
  describe("config", () => {
    it("provide default configuration", () => {
      const config = readConfig();

      expect(config).toEqual({
        host: "127.0.0.1",
        port: 3001,
        definitionPath: "definition.json",
      });
    });

    it("provide custom configuration from environment", () => {
      process.env.GAUDI_RUNTIME_SERVER_HOST = "test-host";
      process.env.GAUDI_RUNTIME_SERVER_PORT = "31337";
      process.env.GAUDI_RUNTIME_DEFINITION_PATH = "test/path";

      const config = readConfig();

      expect(config).toEqual({
        host: "test-host",
        port: 31337,
        definitionPath: "test/path",
      });
    });
  });
});

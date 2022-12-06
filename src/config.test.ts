import { readConfig } from "@src/config";

describe("engine", () => {
  describe("config", () => {
    it("provide defualt configuration", () => {
      const config = readConfig();

      expect(config).toEqual({ inputHooksPath: "", inputPath: "", outputPath: "." });
    });

    it("provide custom configuration from environment", () => {
      process.env.GAUDI_ENGINE_HOOKS_PATH = "HOOK_INPUT";
      process.env.GAUDI_ENGINE_INPUT_PATH = "INPUT";
      process.env.GAUDI_ENGINE_OUTPUT_PATH = "OUTPUT";

      const config = readConfig();

      expect(config).toEqual({
        inputHooksPath: "HOOK_INPUT",
        inputPath: "INPUT",
        outputPath: "OUTPUT",
      });
    });
  });
});

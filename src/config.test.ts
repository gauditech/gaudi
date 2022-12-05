import { readConfig } from "@src/config";

describe("engine", () => {
  describe("config", () => {
    it("provide default configuration", () => {
      const config = readConfig();

      expect(config).toEqual({ inputPath: "", outputFolder: ".", gaudiFolder: "./gaudi" });
    });

    it("provide custom configuration from environment", () => {
      process.env.GAUDI_ENGINE_INPUT_PATH = "INPUT";
      process.env.GAUDI_ENGINE_OUTPUT_PATH = "OUTPUT";

      const config = readConfig();

      expect(config).toEqual({
        inputPath: "INPUT",
        outputFolder: "OUTPUT",
        gaudiFolder: "./gaudi",
      });
    });
  });
});

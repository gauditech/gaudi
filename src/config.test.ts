import path from "path";

import { readConfig } from "@src/config";

describe("engine", () => {
  describe("config", () => {
    const ORIGINAL_ENV = process.env; // Make a copy

    beforeEach(() => {
      jest.resetModules(); // clear cache
      process.env = { ...ORIGINAL_ENV }; // copy original env
    });

    afterEach(() => {
      process.env = ORIGINAL_ENV; // restore original env
    });

    it("should return default configuration", () => {
      const config = readConfig();

      expect(config).toEqual({ inputPath: "", outputFolder: ".", gaudiFolder: "./gaudi" });
    });

    it("should read custom values from environment", () => {
      process.env.GAUDI_ENGINE_INPUT_PATH = "INPUT";
      process.env.GAUDI_ENGINE_OUTPUT_PATH = "OUTPUT";

      const config = readConfig();

      expect(config).toEqual({
        inputPath: "INPUT",
        outputFolder: "OUTPUT",
        gaudiFolder: "./gaudi",
      });
    });

    it("should reads values from config file", () => {
      const config = readConfig(path.join(__dirname, "config.test.env"));

      expect(config).toEqual({
        inputPath: "INPUT_FROM_FILE",
        outputFolder: "OUTPUT_FROM_FILE",
        gaudiFolder: "./gaudi",
      });
    });

    it("should allow overriding config file values with custom values from environment", () => {
      process.env.GAUDI_ENGINE_INPUT_PATH = "INPUT";
      process.env.GAUDI_ENGINE_OUTPUT_PATH = "OUTPUT";

      const config = readConfig(path.join(__dirname, "config.test.env"));

      expect(config).toEqual({
        inputPath: "INPUT",
        outputFolder: "OUTPUT",
        gaudiFolder: "./gaudi",
      });
    });
  });
});

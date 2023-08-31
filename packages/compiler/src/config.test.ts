import path from "path";

import { EngineConfig, readConfig } from "@compiler/config";

describe("engine", () => {
  describe("config", () => {
    const ORIGINAL_ENV = { ...process.env } as const; // Make a readonly copy of the original env

    beforeEach(() => {
      jest.resetModules(); // clear cache
      process.env = { ...ORIGINAL_ENV }; // copy original env
    });

    afterEach(() => {
      process.env = ORIGINAL_ENV; // restore original env
    });

    it("should return default configuration", () => {
      const config = readConfig(path.join(__dirname, "config.test.empty.yaml"));

      expect(config).toEqual({
        inputDirectory: "src",
        outputDirectory: "src",
        gaudiDirectory: path.join("src", "gaudi"),
        configFile: path.join("src", "config.test.empty.yaml"),
      });
    });

    it("should reads values from config file", () => {
      const config = readConfig(path.join(__dirname, "config.test.yaml"));

      const expected: Required<EngineConfig> = {
        inputDirectory: path.join("src", "rootDir"),
        outputDirectory: path.join("src", "outDir"),
        gaudiDirectory: path.join("src", "rootDir", "gaudi"),
        configFile: path.join("src", "config.test.yaml"),
      };

      expect(config).toEqual(expected);
    });
  });
});

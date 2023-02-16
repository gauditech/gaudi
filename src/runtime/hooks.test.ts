import { executeHook } from "@src/runtime/hooks";

describe("hooks", () => {
  const hooksPath = "./src/runtime/test/hooks";

  /*
   * Using math division as a test operation:
   *  - tests multiple arguments
   *  - division is not cummutative operation and will detect errors if arguments are not passed in a specific order
   */

  describe("external hooks", () => {
    it("should resolve static value", async () => {
      const result = await executeHook(
        {
          runtime: { name: "TestRuntime", default: true, sourcePath: hooksPath, type: "node" },
          code: { kind: "source", target: "divideStatic", file: "hooks.js" },
        },
        { x: 6, y: 2 }
      );

      expect(result).toBe(3);
    });

    it("should resolve promise value", async () => {
      const result = await executeHook(
        {
          runtime: { name: "TestRuntime", default: true, sourcePath: hooksPath, type: "node" },
          code: { kind: "source", target: "divideAsync", file: "hooks.js" },
        },
        { x: 6, y: 2 }
      );

      expect(result).toBe(3);
    });
  });

  describe("inline hooks", () => {
    it("should resolve static value", async () => {
      const result = await executeHook(
        {
          runtime: { name: "TestRuntime", default: true, sourcePath: hooksPath, type: "node" },
          code: { kind: "inline", inline: "x / y" },
        },
        { x: 6, y: 2 }
      );

      expect(result).toBe(3);
    });

    it("should resolve promise value", async () => {
      const result = await executeHook(
        {
          runtime: { name: "TestRuntime", default: true, sourcePath: hooksPath, type: "node" },
          code: { kind: "inline", inline: "Promise.resolve(x / y)" },
        },
        { x: 6, y: 2 }
      );

      expect(result).toBe(3);
    });
  });
});

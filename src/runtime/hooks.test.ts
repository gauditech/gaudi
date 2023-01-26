import path from "path";

import { executeHook, importHooks } from "@src/runtime/hooks";

describe("hooks", () => {
  /*
   * Using math division as a test operation:
   *  - tests multiple arguments
   *  - division is not cummutative operation and will detect errors if arguments are not passed in a specific order
   */

  describe("external hooks", () => {
    it("should resolve static value", async () => {
      await importHooks(path.join(__dirname, "./test/hooks"));

      const result = await executeHook(
        { kind: "source", target: "divideStatic", file: "hooks.js" },
        { x: 6, y: 2 }
      );

      expect(result).toBe(3);
    });

    it("should resolve promise value", async () => {
      await importHooks(path.join(__dirname, "./test/hooks"));

      const result = await executeHook(
        { kind: "source", target: "divideAsync", file: "hooks.js" },
        { x: 6, y: 2 }
      );

      expect(result).toBe(3);
    });
  });

  describe("inline hooks", () => {
    it("should resolve static value", async () => {
      const result = await executeHook({ kind: "inline", inline: "x / y" }, { x: 6, y: 2 });

      expect(result).toBe(3);
    });

    it("should resolve promise value", async () => {
      const result = await executeHook(
        { kind: "inline", inline: "Promise.resolve(x / y)" },
        { x: 6, y: 2 }
      );

      expect(result).toBe(3);
    });
  });
});

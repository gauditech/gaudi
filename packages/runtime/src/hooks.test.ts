import { kindFilter } from "@gaudi/compiler/common/kindFilter";
import { getInternalExecutionRuntimeName } from "@gaudi/compiler/composer/executionRuntimes";
import { compileFromString } from "@runtime/common/testUtils";
import { executeHook } from "@runtime/hooks";
import { Definition } from "@gaudi/compiler/types/definition";

describe("hooks", () => {
  const def = createTestDefinition();

  /*
   * Using math division as a test operation:
   *  - tests multiple arguments
   *  - division is not cummutative operation and will detect errors if arguments are not passed in a specific order
   */

  describe("external hooks", () => {
    it("should resolve static value", async () => {
      const result = await executeHook(
        def,
        { kind: "source", target: "divideStatic", file: "hooks.js", runtimeName: "TestRuntime" },
        { x: 6, y: 2 }
      );

      expect(result).toBe(3);
    });

    it("should resolve promise value", async () => {
      const result = await executeHook(
        def,
        { kind: "source", target: "divideAsync", file: "hooks.js", runtimeName: "TestRuntime" },
        { x: 6, y: 2 }
      );

      expect(result).toBe(3);
    });
  });

  describe("inline hooks", () => {
    it("should resolve static value", async () => {
      const result = await executeHook(def, { kind: "inline", inline: "x / y" }, { x: 6, y: 2 });

      expect(result).toBe(3);
    });

    it("should resolve promise value", async () => {
      const result = await executeHook(
        def,
        { kind: "inline", inline: "Promise.resolve(x / y)" },
        { x: 6, y: 2 }
      );

      expect(result).toBe(3);
    });
  });

  describe("execution runtime", () => {
    it("should execute hooks from multiple exec runtimes", async () => {
      const bp = `
      runtime MathRuntime {
        default
        source path "./src/runtime/test/hooks"
      }

      runtime TextRuntime {
        source path "./src/runtime/test/hooks2"
      }

      model Result {
        field name { type string }
        field avg { type integer }
      }

      api {
        entrypoint Result {
          create endpoint {
            action {
              create {
                set name hook {
                  runtime TextRuntime
                  arg value "First Last"
                  arg prefix "Mr. "
                  source prefix from "hooks2.js"
                }
                set avg hook {
                  // thisi is from the default runtime
                  arg x 100
                  arg y 20
                  source prefix from "hooks.js"
                }
              }
            }
          }
        }
      }

    `;

      const result = compileFromString(bp);
      const action = kindFilter(result.apis[0].entrypoints[0].endpoints, "create")
        .shift()
        ?.actions.at(0);

      expect(action).toMatchSnapshot();
    });

    it("should run hook from internal exec runtime", async () => {
      const def = createTestDefinition();

      const result = await executeHook(
        def,
        {
          kind: "source",
          file: "hooks/index.js",
          target: "echo",
          runtimeName: getInternalExecutionRuntimeName(),
        },
        { value: "ASDF" }
      );

      expect(result).toBe("ASDF");
    });
  });
});

/**
 * Creates test definition struct
 */
function createTestDefinition(): Definition {
  const bp = `
    runtime TestRuntime {
      default
      source path "./src/runtime/test/hooks"
    }
  `;
  return compileFromString(bp);
}

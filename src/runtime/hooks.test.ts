import { getInternalExecutionRuntimeName } from "@src/composer/executionRuntimes";
import { compileToOldSpec, compose } from "@src/index";
import { executeHook } from "@src/runtime/hooks";
import { CreateEndpointDef, Definition } from "@src/types/definition";

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
        {
          runtimeName: "TestRuntime",
          code: { kind: "source", target: "divideStatic", file: "hooks.js" },
        },
        { x: 6, y: 2 }
      );

      expect(result).toBe(3);
    });

    it("should resolve promise value", async () => {
      const result = await executeHook(
        def,
        {
          runtimeName: "TestRuntime",
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
        def,
        {
          runtimeName: "TestRuntime",
          code: { kind: "inline", inline: "x / y" },
        },
        { x: 6, y: 2 }
      );

      expect(result).toBe(3);
    });

    it("should resolve promise value", async () => {
      const result = await executeHook(
        def,
        {
          runtimeName: "TestRuntime",
          code: { kind: "inline", inline: "Promise.resolve(x / y)" },
        },
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

      entrypoint Results {
        target Result
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

    `;

      const result = compose(compileToOldSpec(bp));
      const action = result.entrypoints[0].endpoints
        .filter((ep): ep is CreateEndpointDef => ep.kind === "create")
        .shift()
        ?.actions.at(0);

      expect(action).toMatchSnapshot();
    });

    it("should run hook from internal exec runtime", async () => {
      const def = createTestDefinition();

      const result = await executeHook(
        def,
        {
          runtimeName: getInternalExecutionRuntimeName(),
          code: { kind: "source", file: "hooks/index.js", target: "echo" },
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
  const def = compose({
    entrypoints: [],
    models: [],
    populators: [],
    runtimes: [
      {
        name: "TestRuntime",
        default: true,
        sourcePath: "./src/runtime/test/hooks",
      },
    ],
    authenticator: undefined,
    generators: [],
  });

  return def;
}

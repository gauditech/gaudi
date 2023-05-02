import { compileToOldSpec, compose } from "@src/index";
import { CustomOneEndpointDef } from "@src/types/definition";

describe("compose hooks", () => {
  it("composes source hooks", () => {
    const bp = `
      runtime MyRuntime {
        source path "some/path/to/file"
      }

      model Org {
        field name {
          type string,
          validate {
            hook {
              default arg name
              runtime MyRuntime
              source someHook from "githubc.js"
            }
          }
        }
        hook description {
          runtime MyRuntime
          source someHook from "githubc.js"
        }
      }

      entrypoint Org {
        create endpoint {
          action {
            create {
              set name hook {
                runtime MyRuntime
                source someHook from "hooks.js"
              }
            }
          }
        }
      }

    `;
    const result = compose(compileToOldSpec(bp));

    expect(result).toMatchSnapshot();
  });

  it("inline hooks", () => {
    const bp = `
      runtime MyRuntime {
        source path "some/path/to/file"
      }

      model Org {
        field name {
          type string,
          validate {
            hook {
              default arg name
              inline "'test name'"
            }
          }
        }
        hook description {
          runtime MyRuntime
          inline "'some description'"
        }
      }

      entrypoint Org {
        create endpoint {
          action {
            create {
              set name hook {
                inline "'test name'"
              }
            }
          }
        }
      }

    `;
    const result = compose(compileToOldSpec(bp));

    expect(result).toMatchSnapshot();
  });

  it("defaults to the default execution runtime when hook runtime is empty", () => {
    const bp = `
      runtime MyRuntime {
        default
        source path "some/path/to/file"
      }

      runtime MyRuntime2 {
        source path "some/path/to/file"
      }

      model Org { field name { type string } }

      entrypoint Org {
        create endpoint {
          action {
            create {
              set name hook {
                source randomSlug from "hooks.js"
              }
            }
          }
        }
      }

    `;

    const result = compose(compileToOldSpec(bp));

    expect(result.entrypoints[0].endpoints[0]).toMatchSnapshot();
  });

  it("action hook", () => {
    const bp = `
      runtime MyRuntime {
        source path "some/path/to/file"
      }

      model Org {
        field name { type string }
      }

      entrypoint Org {
        identify as org

        custom endpoint {
          path "somePath"
          method POST
          cardinality one

          action {
            execute {
              // test action inputs
              virtual input termsOfUse { type boolean }

              hook {
                // test hook args
                arg name org.name
                arg terms termsOfUse

                runtime MyRuntime
                source someHook from "hooks.js"
              }
            }
          }
        }
      }
    `;
    const result = compose(compileToOldSpec(bp));

    expect(result.entrypoints[0].endpoints).toMatchSnapshot();
  });

  it("composes action hook", () => {
    const bp = `
      model Org { field name { type string} }

      entrypoint Org {

        // login
        custom endpoint {
          path "somePath"
          method POST
          cardinality one

          action {
            execute {

              virtual input prop { type string }

              hook {
                // action arg hook
                arg user query { from Org, filter { id is 1 }, select { id, name }} // TODO: read from ctx - id

                runtime @GAUDI_INTERNAL
                source login from "hooks/auth"
              }
            }
          }
        }
      }
    `;
    const def = compose(compileToOldSpec(bp));
    const action = (def.entrypoints[0].endpoints[0] as CustomOneEndpointDef).actions[0];

    expect(action).toMatchSnapshot();
  });
});

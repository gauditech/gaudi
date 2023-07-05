import { compileFromString } from "@compiler/common/testUtils";
import {
  CreateEndpointDef,
  CreateOneAction,
  CustomOneEndpointDef,
} from "@compiler/types/definition";

describe("compose hooks", () => {
  it("composes source hooks", () => {
    const bp = `
      runtime MyRuntime {
        source path "some/path/to/file"
      }

      validator Test {
        arg name { type string }
        assert hook {
          arg name name
          runtime MyRuntime
          source someHook from "githubc.js"
        }
        error { code "test" }
      }

      model Org {
        field name { type string, validate { Test() } }
        hook description {
          runtime MyRuntime
          source someHook from "githubc.js"
        }
      }

      api {
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
      }

    `;
    const def = compileFromString(bp);
    const validatorHook = def.validators.at(-1)?.assert;
    const modelHook = def.models[0].hooks[0];
    const actionHook = (
      (def.apis[0].entrypoints[0].endpoints[0] as CreateEndpointDef).actions[0] as CreateOneAction
    ).changeset.find(({ name }) => name === "name");

    expect({ validatorHook, modelHook, actionHook }).toMatchSnapshot();
  });

  it("inline hooks", () => {
    const bp = `
      runtime MyRuntime {
        source path "some/path/to/file"
      }

      validator Test {
        arg name { type string }
        assert hook {
          arg name name
          inline "name === 'name'"
        }
        error { code "test" }
      }

      model Org {
        field name { type string, validate { Test() } }
        hook description {
          runtime MyRuntime
          inline "'some description'"
        }
      }

      api {
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
      }

    `;
    const def = compileFromString(bp);
    const validatorHook = def.validators.at(-1)?.assert;
    const modelHook = def.models[0].hooks[0];
    const actionHook = (
      (def.apis[0].entrypoints[0].endpoints[0] as CreateEndpointDef).actions[0] as CreateOneAction
    ).changeset.find(({ name }) => name === "name");

    expect({ validatorHook, modelHook, actionHook }).toMatchSnapshot();
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

      api {
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
      }

    `;

    const result = compileFromString(bp);

    expect(result.apis[0].entrypoints[0].endpoints[0]).toMatchSnapshot();
  });

  it("action hook", () => {
    const bp = `
      runtime MyRuntime {
        source path "some/path/to/file"
      }

      model Org {
        field name { type string }
      }

      api {
        entrypoint Org as org {

          custom endpoint {
            path "somePath"
            method POST
            cardinality one

            extra inputs {
              // test action inputs
              field termsOfUse { type boolean }
            }

            action {
              execute {
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
      }
    `;
    const result = compileFromString(bp);

    expect(result.apis[0].entrypoints[0].endpoints).toMatchSnapshot();
  });

  it("composes action hook", () => {
    const bp = `
      model Org { field name { type string} }

      api {
        entrypoint Org {

          // login
          custom endpoint {
            path "somePath"
            method POST
            cardinality one

            extra inputs {
              field prop { type string }
            }

            action {
              execute {
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
      }
    `;
    const def = compileFromString(bp);
    const action = (def.apis[0].entrypoints[0].endpoints[0] as CustomOneEndpointDef).actions[0];

    expect(action).toMatchSnapshot();
  });
});

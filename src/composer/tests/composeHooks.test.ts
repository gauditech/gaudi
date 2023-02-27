import { compile } from "@src/compiler/compiler";
import { compose } from "@src/composer/composer";
import { parse } from "@src/parser/parser";
import { CustomOneEndpointDef } from "@src/types/definition";

describe("compose hooks", () => {
  it("composes source hooks", () => {
    const bp = `
      runtime MyRuntime {
        sourcePath "some/path/to/file"
      }

      model Org {
        field name {
          type text,
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

      entrypoint Orgs {
        target model Org as org
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
    const result = compose(compile(parse(bp)));

    expect(result).toMatchSnapshot();
  });

  it("inline hooks", () => {
    const bp = `
      runtime MyRuntime {
        sourcePath "some/path/to/file"
      }

      model Org {
        field name {
          type text,
          validate {
            hook {
              default arg name
              inline \`"test name"\`
            }
          }
        }
        hook description {
          runtime MyRuntime
          inline \`"some description"\`        
        }
      }

      entrypoint Orgs {
        target model Org as org
        create endpoint {
          action {
            create {
              set name hook {
                inline \`"test name"\`
              }
            }
          }
        }
      }
  
    `;
    const result = compose(compile(parse(bp)));

    expect(result).toMatchSnapshot();
  });

  it("defaults to the default execution runtime when hook runtime is empty", () => {
    const bp = `
      runtime MyRuntime {
        default
        sourcePath "some/path/to/file"
      }

      runtime MyRuntime2 {
        sourcePath "some/path/to/file"
      }

      model Org { field name { type text } }

      entrypoint Orgs {
        target model Org as org
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

    const result = compose(compile(parse(bp)));

    expect(result.entrypoints[0].endpoints[0]).toMatchSnapshot();
  });

  it("fails on invalid runtime name", () => {
    const bp = `
      runtime MyRuntime {
        sourcePath "some/path/to/file"
      }

      entrypoint Orgs {
        target model Org as org
        create endpoint {
          action {
            create {
              set name hook {
                runtime InvalidMyRuntime
                source randomSlug from "hooks.js"
              }
            }
          }
        }
      }
  
    `;

    expect(() => compose(compile(parse(bp)))).toThrowErrorMatchingInlineSnapshot(
      `"Unknown refkey: Org"`
    );
  });

  it("action hook", () => {
    const bp = `
      runtime MyRuntime {
        sourcePath "some/path/to/file"
      }

      model Org {
        field name { type text }
      }

      entrypoint Orgs {
        target model Org

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
                arg name name
                arg terms termsOfUse

                runtime MyRuntime
                source someHook from "hooks.js"
              }
            }
          }
        }
      }
    `;
    const result = compose(compile(parse(bp)));

    expect(result.entrypoints[0].endpoints).toMatchSnapshot();
  });

  it("fails on inline action hook", () => {
    const bp = `
      runtime MyRuntime {
        sourcePath "some/path/to/file"
      }

      model Org {}

      entrypoint Orgs {
        target model Org

        custom endpoint {
          path "somePath"
          method POST
          cardinality one

          action {
            execute {
              hook {
                runtime MyRuntime
                inline \`"some return value"\`
              }
            }
          }
        }
      }
    `;

    expect(() => compose(compile(parse(bp)))).toThrowErrorMatchingInlineSnapshot(
      `"Inline hooks cannot be used for "execute" actions"`
    );
  });

  it("composes action hook", () => {
    const bp = `
      model Org { field name { type text} }

      entrypoint Org {
        target model Org
 
        // login
        custom endpoint {
          path "somePath"
          method POST
          cardinality one
      
          action {
            execute {
              hook {
                // action arg hook
                arg user query { from Org, filter id is 1, select { id, name }} 

                runtime @GAUDI_INTERNAL
                source login from "hooks/auth"
              }
            }
          }
        }
      }
    `;
    const def = compose(compile(parse(bp)));
    const action = (def.entrypoints[0].endpoints[0] as CustomOneEndpointDef).actions[0];

    expect(action).toMatchSnapshot();
  });
});

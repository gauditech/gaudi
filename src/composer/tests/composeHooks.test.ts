import { compile } from "@src/compiler/compiler";
import { compose } from "@src/composer/composer";
import { parse } from "@src/parser/parser";

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

  it("composes inline hooks", () => {
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

  it("defaults to the first execution runtime when hook runtime is empty", () => {
    const bp = `
      runtime MyRuntime {
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
});

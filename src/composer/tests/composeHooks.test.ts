import { compileToOldSpec, compose } from "@src/index";

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

      entrypoint Orgs {
        target Org as org
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

  it("composes inline hooks", () => {
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

      entrypoint Orgs {
        target Org as org
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

      entrypoint Orgs {
        target Org as org
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

  it("fails on invalid runtime name", () => {
    const bp = `
      runtime MyRuntime {
        source path "some/path/to/file"
      }

      entrypoint Orgs {
        target Org as org
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

    expect(() => compose(compileToOldSpec(bp))).toThrowErrorMatchingInlineSnapshot(
      `"Unknown refkey: Org"`
    );
  });
});

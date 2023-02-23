import { compile, compose, parse } from "@src/index";
import { CreateEndpointDef, CustomManyEndpointDef, ExecuteHookAction } from "@src/types/definition";

describe("entrypoint", () => {
  it("composes basic example", () => {
    // Orgs assumes default response
    // Orgs.Repositories assumes default identifyWith; nested org select assuming all fields since not given
    const bp = `
    model Org {
      field slug { type text, unique }
      field name { type text }
      relation repos { from Repo, through org }
    }
    model Repo {
      reference org { to Org }
      field title { type text }
    }

    entrypoint Orgs {
      target model Org
      identify with slug
    
      list endpoint {}
      get endpoint {}
    
      entrypoint Repositories {
        target relation repos as repo
        response { id, org }

        list endpoint {}
        get endpoint {}
        create endpoint {}

        custom endpoint {
          cardinality one
          method PATCH
          path "somePath"

          action {
            update {}
          }
        }
      }
    }
    `;
    const def = compose(compile(parse(bp)));
    expect(def.entrypoints).toMatchSnapshot();
  });
  it("adds validators into fieldsets", () => {
    const bp = `
    model Org {
      field name { type text, validate { min 4, max 100 } }
    }

    entrypoint Orgs {
      target model Org
      create endpoint {}
    }
    `;
    const def = compose(compile(parse(bp)));
    const endpoint = def.entrypoints[0].endpoints[0] as CreateEndpointDef;
    expect(endpoint.fieldset).toMatchSnapshot();
  });

  it("action should send response", () => {
    const bp = `
    runtime MyRuntime {
      sourcePath "some/source/path"
    }

    model Org {}

    entrypoint Orgs {
      target model Org

      // endpoint W/ responding action
      custom endpoint {
        path "somePath1"
        method POST
        cardinality many

        action {
          execute {
            responds
            hook {
              runtime MyRuntime
              source testFn from "t/h/p"
            }
          }
        }
      }
    }
    `;
    const def = compose(compile(parse(bp)));

    const endpoint = def.entrypoints[0].endpoints[0] as CustomManyEndpointDef;
    const action = endpoint.actions[0] as ExecuteHookAction;

    expect(action.responds).toBe(true);
    expect(endpoint.responds).toBe(false);
  });

  it("endpoint should send response", () => {
    const bp = `
    runtime MyRuntime {
      sourcePath "some/source/path"
    }

    model Org {}

    entrypoint Orgs {
      target model Org

      // endpoint W/O responding action
      custom endpoint {
        path "somePath1"
        method POST
        cardinality many

        action {
          execute {
            hook {
              runtime MyRuntime
              source testFn from "t/h/p"
            }
          }
        }
      }
    }
    `;
    const def = compose(compile(parse(bp)));

    const endpoint = def.entrypoints[0].endpoints[0] as CustomManyEndpointDef;
    const action = endpoint.actions[0] as ExecuteHookAction;

    expect(action.responds).toBe(false);
    expect(endpoint.responds).toBe(true);
  });

  it("fail for multiple actions that want to respond", () => {
    const bp = `
    runtime MyRuntime {
      sourcePath "some/source/path"
    }

    model Org {}

    entrypoint Orgs {
      target model Org

      custom endpoint {
        path "somePath1"
        method POST
        cardinality many

        action {
          execute {
            responds
            hook {
              runtime MyRuntime
              source testFn from "t/h/p"
            }
          }
          execute {
            responds
            hook {
              runtime MyRuntime
              source testFn from "t/h/p"
            }
          }
        }
      }
    }
    `;

    expect(() => compose(compile(parse(bp)))).toThrowErrorMatchingInlineSnapshot(
      `"At most one action in entrypoint can have "responds" attribute"`
    );
  });

  it("fails if responds action is used in implicit endpoints", () => {
    const bp = `
    runtime MyRuntime {
      sourcePath "some/source/path"
    }

    model Org {}

    entrypoint Orgs {
      target model Org

      create endpoint {
        action {
          execute {
            responds
            hook {
              runtime MyRuntime
              source testFn from "t/h/p"
            }
          }
        }
      }
    }
    `;

    expect(() => compose(compile(parse(bp)))).toThrowErrorMatchingInlineSnapshot(
      `"Actions with "responds" keyword are allowed only in "custom-one" and "custom-many" endpoints, not in "create""`
    );
  });

  it("fails if responds action is used in implicit actions", () => {
    const bp = `
    model Org {}

    entrypoint Orgs {
      target model Org

      custom endpoint {
        path "somePath"
        method POST
        cardinality many

        action {
          create {
            responds
          }
        }
      }
    }
    `;

    expect(() => compose(compile(parse(bp)))).toThrowErrorMatchingInlineSnapshot(
      `"Keyword "responds" is allowed only on "execute" actions"`
    );
  });
});

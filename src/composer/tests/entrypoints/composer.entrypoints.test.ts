import { compileToOldSpec, compose } from "@src/index";
import { CreateEndpointDef, CustomManyEndpointDef, ExecuteHookAction } from "@src/types/definition";

describe("entrypoint", () => {
  it("composes basic example", () => {
    // Orgs assumes default response
    // Orgs.Repositories assumes default identifyWith; nested org select assuming all fields since not given
    const bp = `
    model Org {
      field slug { type string, unique }
      field name { type string }
      relation repos { from Repo, through org }
    }
    model Repo {
      reference org { to Org }
      field title { type string }
    }

    api {
      entrypoint Org as org {
        identify { through slug }

        list endpoint {
          pageable
          order by { slug desc }
        }
        get endpoint {}

        entrypoint repos {
          response { id, org }

          list endpoint {}
          get endpoint {}
          create endpoint {}

          custom endpoint {
            cardinality one
            method PATCH
            path "somePath"

            action {
              update org as newOrg {}
            }
          }
        }
      }
    }
    `;
    const def = compose(compileToOldSpec(bp));
    expect(def.apis[0].entrypoints).toMatchSnapshot();
  });
  it("adds validators into fieldsets", () => {
    const bp = `
    model Org {
      field name { type string, validate { min 4, max 100 } }
    }

    api {
      entrypoint Org {
        create endpoint {}
      }
    }
    `;
    const def = compose(compileToOldSpec(bp));
    const endpoint = def.apis[0].entrypoints[0].endpoints[0] as CreateEndpointDef;
    expect(endpoint.fieldset).toMatchSnapshot();
  });

  it("action should send response", () => {
    const bp = `
    runtime MyRuntime {
      source path "some/source/path"
    }

    model Org {}

    api {
      entrypoint Org {

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
    }
    `;
    const def = compose(compileToOldSpec(bp));

    const endpoint = def.apis[0].entrypoints[0].endpoints[0] as CustomManyEndpointDef;
    const action = endpoint.actions[0] as ExecuteHookAction;

    expect(action.responds).toBe(true);
    expect(endpoint.responds).toBe(false);
  });

  it("endpoint should send response", () => {
    const bp = `
    runtime MyRuntime {
      source path "some/source/path"
    }

    model Org {}

    api {
      entrypoint Org {

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
    }
    `;
    const def = compose(compileToOldSpec(bp));

    const endpoint = def.apis[0].entrypoints[0].endpoints[0] as CustomManyEndpointDef;
    const action = endpoint.actions[0] as ExecuteHookAction;

    expect(action.responds).toBe(false);
    expect(endpoint.responds).toBe(true);
  });

  it("collects dependencies", () => {
    const bp = `
    model Org {
      field name { type string }
      field desc { type string }

      relation repos { from Repo, through org }

      computed repoCount { count(repos.id) }
      computed coef { 2 }
    }
    model Repo {
      reference org { to Org }

      field name { type string }

      relation issues { from Issue, through repo}
    }
    model Issue {
      reference repo { to Repo }

      field source { type string }
      field orgDesc { type string }
      field orgCoef { type integer }
    }

    api {
      entrypoint Org as org {
        entrypoint repos as repo {
          create endpoint {
            action {
              create as repo {}
              create repo.issues as i {
                set source org.name + repo.name
                set orgDesc org.desc
                set orgCoef org.repoCount * org.coef
              }
            }
          }
        }
      }
    }
    `;
    const def = compose(compileToOldSpec(bp));
    const endpoint = def.apis[0].entrypoints[0].entrypoints[0].endpoints[0] as CreateEndpointDef;
    const orgSelect = endpoint.parentContext[0].select.map((s) => s.alias);
    const repoSelect = endpoint.target.select.map((s) => s.alias);
    const actionSelects = endpoint.actions.map((a) =>
      ("select" in a ? a.select : null)?.map((a) => a && a.alias)
    );
    expect({ orgSelect, repoSelect, actionSelects }).toMatchSnapshot();
  });
  it("composes single cardinality", () => {
    const bp = `
    model User {
      field name { type string }
      reference address { to Address, unique }
    }

    model Address {
      field name { type string }
      relation user { from User, through address }
    }

    api {
      entrypoint User {
        entrypoint address {
          // cardinality is one
          get endpoint {}
          update endpoint {}
          custom endpoint {
            method GET
            cardinality one
            path "custom"
          }
        }
      }

      entrypoint Address {
        entrypoint user {
          // cardinality is nullable
          create endpoint {}
          get endpoint {}
          update endpoint {}
          delete endpoint {}
          custom endpoint {
            method GET
            cardinality one
            path "custom"
          }
        }
      }
    }
    `;
    const def = compose(compileToOldSpec(bp));
    expect(def.apis[0].entrypoints[0].entrypoints[0]).toMatchSnapshot();
    expect(def.apis[0].entrypoints[1].entrypoints[0]).toMatchSnapshot();
  });
});

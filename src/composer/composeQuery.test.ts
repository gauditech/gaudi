import { compileToOldSpec, compose } from "@src/index";
import { CustomOneEndpointDef } from "@src/types/definition";

describe("compose model queries", () => {
  it("nested example without filters", () => {
    const bp = `
    model Org {
      relation repos { from Repo, through org }
      query back_to_org { from repos.org }
    }
    model Repo {
      reference org { to Org }
    }
    `;
    const def = compose(compileToOldSpec(bp));
    expect(def.models[0].queries).toMatchSnapshot();
  });
  it("example with nested filters", () => {
    const bp = `
    model Org {
      relation repos { from Repo, through org }
      query repos_if_one { from repos, filter { org.id is 1 and is_active } }
    }
    model Repo {
      field is_active { type boolean }
      reference org { to Org }
    }
    `;
    const def = compose(compileToOldSpec(bp));

    expect(def.models[0].queries).toMatchSnapshot();
  });

  it("order and limit", () => {
    const bp = `
    model Org {
      relation repos { from Repo, through org }
      query recent_repos {
        from repos,
        order by { id desc },
        limit 5
      }
    }
    model Repo {
      reference org { to Org }
    }
    `;
    const def = compose(compileToOldSpec(bp));
    expect(def.models[0].queries[0]).toMatchSnapshot();
  });
});

describe("compose action queries", () => {
  describe('"fetch" action', () => {
    it("native endpoint", () => {
      const bp = `
      model Org {
        field name { type string }
        field description { type string }
      }
      model Repo {
      }

      api {
        entrypoint Org {
          // test in native endpoint
          update endpoint {
            action {
              update {}
              // target
              fetch as cOrg {
                query { from Org, filter { id is 1 }, select {name} } // TODO: read from ctx - id
              }
              // other model
              fetch as cRepo {
                query { from Repo, filter { id is 1 } } // TODO: read from ctx - id
              }
            }
          }
        }
      }
      `;

      const def = compose(compileToOldSpec(bp));
      expect(
        (def.apis[0].entrypoints[0].endpoints[0] as CustomOneEndpointDef).actions[0]
      ).toMatchSnapshot();
    });
    it("custom endpoint", () => {
      const bp = `
      model Org {
        field name { type string }
        field description { type string }
      }
      model Repo {
      }

      api {
        entrypoint Org {

          // test in custom endpoint
          custom endpoint {
            path "customPath"
            method POST
            cardinality one

            action {
              // target
              fetch as cOrg {
                query { from Org, filter { id is 1 }, select {name} } // TODO: read from ctx - id
              }
              // other model
              fetch as cRepo {
                query { from Repo, filter { id is 1 } } // TODO: read from ctx - id
              }
            }
          }
        }
      }
      `;

      const def = compose(compileToOldSpec(bp));
      expect(
        (def.apis[0].entrypoints[0].endpoints[0] as CustomOneEndpointDef).actions[0]
      ).toMatchSnapshot();
    });
  });
});

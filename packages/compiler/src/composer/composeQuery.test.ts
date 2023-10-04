import { compileFromString } from "@compiler/common/testUtils";
import { CustomOneEndpointDef, UpdateEndpointDef } from "@compiler/types/definition";

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
    const def = compileFromString(bp);
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
    const def = compileFromString(bp);

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
    const def = compileFromString(bp);
    expect(def.models[0].queries[0]).toMatchSnapshot();
  });
});

describe("compose action queries", () => {
  describe("actions 2", () => {
    // diffrent "query" action types
    const actions = [
      // --- query action
      // target
      {
        name: "'query' action on target",
        action: `query { from Org, filter { id is 1 }, select {name} }`, // TODO: read from ctx - id
      },
      // other model
      {
        name: "'query' action on other model",
        action: `query { from Repo, filter { id is 1 } }`, // TODO: read from ctx - id
      },

      // --- update action
      // target
      {
        name: "'update' action on target",
        action: `query { from Org as uo, filter { uo.id is 1 }, select {name}, update { set description uo.description + " [updated]" }}`,
      },
      // other model
      {
        name: "'update' action on other model",
        action: `query { from Repo as ur, filter { ur.id is 1 }, update { set name ur.name + " [update]" }}`,
      },

      // --- delete action
      // target
      {
        name: "'delete' action on target",
        action: `query { from Org, filter { description is "test content" }, delete }`,
      },
      // other model
      {
        name: "'delete' action on other model",
        action: `query { from Repo, filter { id is 1 }, delete }`,
      },
    ];

    const bpDefaultEndpoint = (action: string) => `
      model Org {
        field name { type string }
        field description { type string }
      }
      model Repo {
        field name { type string }
      }

      api {
        entrypoint Org {
          // test in native endpoint
          update endpoint {
            action {
              // required default action
              update {
                input { name, description }
              }

              ${action}
            }
          }
        }
      }
    `;

    const bpCustomEndpoint = (action: string) => `
      model Org {
        field name { type string }
        field description { type string }
      }
      model Repo {
        field name { type string }
      }

      api {
        entrypoint Org {

          // test in custom endpoint
          custom endpoint {
            path "customPath"
            method POST
            cardinality one

            action {
              ${action}
            }
          }
        }
      }
    `;

    // iterate actions through different endpoint types
    actions.forEach((a) => {
      describe("default endpoint", () => {
        it(a.name, () => {
          const def = compileFromString(bpDefaultEndpoint(a.action));
          const ep = def.apis[0].entrypoints[0].endpoints[0] as UpdateEndpointDef;
          // take the second action after the default one
          expect(ep.actions[1]).toMatchSnapshot();
        });
      });

      describe("custom endpoint", () => {
        it(a.name, () => {
          const def = compileFromString(bpCustomEndpoint(a.action));
          const ep = def.apis[0].entrypoints[0].endpoints[0] as UpdateEndpointDef;

          // take the first action
          expect(ep.actions[0]).toMatchSnapshot();
        });
      });
    });
  });
});

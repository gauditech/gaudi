import _ from "lodash";

import { compileToOldSpec, compose } from "@src/index";
import { ActionKindAST, EndpointBodyAST, EndpointCardinality } from "@src/types/ast";
import { CreateEndpointDef, EndpointType, UpdateEndpointDef } from "@src/types/definition";

describe("custom actions", () => {
  it("succeeds for basic composite create", () => {
    const bp = `
    model Org {
      field is_new { type boolean }
      field name { type string }
      reference extras { to OrgExtra, unique }
    }
    model OrgExtra {
      relation org { from Org, through extras }
    }
    model OrgOwner { reference org { to Org } }

    entrypoint Orgs {
      target Org as org
      create endpoint {
        action {
          create OrgExtra as e {}
          create org {
            set is_new true
            set extras e
          }
          create OrgOwner as oo {
            set org_id org.id
          }
        }
      }
    }
    `;
    const def = compose(compileToOldSpec(bp));
    const endpoint = def.entrypoints[0].endpoints[0] as CreateEndpointDef;
    expect(endpoint.actions).toMatchSnapshot();
  });
  it("succeeds for basic update with a deny rule", () => {
    const bp = `
    model Org {
      field name { type string }
      field description { type string }
      field uuid { type string }
      reference extras { to OrgExtra, unique }
    }
    model OrgExtra {
      relation org { from Org, through extras }
    }
    entrypoint Orgs {
      target Org as org
      update endpoint {
        action {
          update org as ox {
            set name "new name"
            deny { uuid }
          }
        }
      }
    }`;
    const def = compose(compileToOldSpec(bp));
    const endpoint = def.entrypoints[0].endpoints[0] as UpdateEndpointDef;
    expect(endpoint.actions).toMatchSnapshot();
  });
  it("succeeds with nested sibling reference", () => {
    const bp = `
    model Org {
      field name { type string }
      field name2 { type string }
      field name3 { type string }
    }
    entrypoint Org {
      target Org
      create endpoint {
        action {
          create {
            set name3 name2
            set name2 name
          }
        }
      }
    }
    `;
    const def = compose(compileToOldSpec(bp));
    const endpoint = def.entrypoints[0].endpoints[0] as CreateEndpointDef;
    expect(endpoint.actions).toMatchSnapshot();
    expect(endpoint.fieldset).toMatchSnapshot();
  });
  it("fails when reference and its field are being set at the same time", () => {
    const bp = `
    model Org { relation repos { from Repo, through org }}
    model Repo { reference org { to Org }}
    entrypoint Org {
      target Org as org
      entrypoint Repos {
        target repos as repo
        create endpoint {
          action {
            create repo {
              set org_id 1
              set org org
            }
          }
        }
      }
    }
    `;
    const spec = compileToOldSpec(bp);
    expect(() => compose(spec)).toThrowErrorMatchingInlineSnapshot(`"Found duplicates: [org_id]"`);
  });
  it("correctly sets parent context", () => {
    const bp = `
    model Org {
      relation repos { from Repo, through org }
    }
    model Repo {
      reference org { to Org }
      field name { type string }
    }
    entrypoint Orgs {
      target Org as myorg
      entrypoint Repos {
        target repos as myrepo
        create endpoint {}
      }
    }
    `;
    const def = compose(compileToOldSpec(bp));
    const endpoint = def.entrypoints[0].entrypoints[0].endpoints[0] as CreateEndpointDef;
    expect(endpoint.actions).toMatchSnapshot();
  });

  it("can create nested relations through transient references", () => {
    const bp = `
    model Org { relation repos { from Repo, through org } relation logs { from OrgLog, through org } }
    model Repo { reference org { to Org } field name { type string } }
    model OrgLog { reference org { to Org } }

    entrypoint R {
      target Repo as repo
      create endpoint {
        action {
          create repo {}
          create repo.org.logs as log {}
        }
      }
    }
    `;
    const def = compose(compileToOldSpec(bp));
    const endpoint = def.entrypoints[0].endpoints[0] as CreateEndpointDef;
    expect(endpoint.actions).toMatchSnapshot();
  });
  it("can update deeply nested references", () => {
    const bp = `
    model Org {
      field name { type string }
      relation repos { from Repo, through org }
    }
    model Repo { reference org { to Org } relation issues { from Issue, through repo } }
    model Issue { reference repo { to Repo } }

    entrypoint I {
      target Issue as issue
      update endpoint {
        action {
          update issue {}
          update issue.repo.org as org {}
        }
      }
    }
    `;
    const def = compose(compileToOldSpec(bp));
    const endpoint = def.entrypoints[0].endpoints[0] as UpdateEndpointDef;
    expect(endpoint.actions).toMatchSnapshot();
  });
  it("fails when default action override is invalid type", () => {
    const bp = `
    model Org {
      field name { type string }
    }
    entrypoint Orgs {
      target Org
      update endpoint {
        action {
          create {}
        }
      }
    }`;
    const spec = compileToOldSpec(bp);
    expect(() => compose(spec)).toThrowErrorMatchingInlineSnapshot(
      `"Mismatching context action: overriding update endpoint with a create action"`
    );
  });
  it("succeeds with custom inputs", () => {
    const bp = `
    model Org {
      field name { type string }
      field description { type string }
      field uuid { type string }
      reference extras { to OrgExtra, unique }
    }
    model OrgExtra {
      field name { type string }
      relation org { from Org, through extras }
    }
    entrypoint Orgs {
      target Org as org
      update endpoint {
        action {
          update org as ox {
            set name "new name"
            input { description { optional } }
            reference extras through name
          }
        }
      }
    }`;
    const def = compose(compileToOldSpec(bp));
    const endpoint = def.entrypoints[0].endpoints[0] as UpdateEndpointDef;
    expect(endpoint.actions).toMatchSnapshot();
  });
  it("succeeds with arithmetic expressions in setters", () => {
    const bp = `
    model Org {
      field name { type string }
      field description { type string }
      field descLength { type integer }
    }
    entrypoint Orgs {
      target Org as org
      create endpoint {
        action {
          create {
            set name "new name"
            set description concat(name, " is great")
            set descLength length(description) + 1
          }
        }
      }
    }`;
    const def = compose(compileToOldSpec(bp));
    const endpoint = def.entrypoints[0].endpoints[0] as UpdateEndpointDef;
    expect(endpoint.actions).toMatchSnapshot();
  });
  it("fails when input and reference are on the same field", () => {
    const bp = `
    model Org {
      reference extras { to OrgExtra, unique }
    }
    model OrgExtra {
      relation org { from Org, through extras }
    }
    entrypoint Orgs {
      target Org as org
      update endpoint {
        action {
          update org as ox {
            input { extras_id }
            reference extras through id
          }
        }
      }
    }`;
    const spec = compileToOldSpec(bp);
    expect(() => compose(spec)).toThrowErrorMatchingInlineSnapshot(
      `"Found duplicates: [extras_id]"`
    );
  });
  it("succeeds when virtual input is defined and referenced", () => {
    const bp = `
    model Org { field name { type string } }

    entrypoint Orgs {
      target Org as org
      create endpoint {
        action {
          create org {
            virtual input iname { type string, validate { min 4 } }
            set name concat("Mr/Mrs ", iname)
          }
        }
      }
    }
    `;

    const def = compose(compileToOldSpec(bp));
    const endpoint = def.entrypoints[0].endpoints[0] as CreateEndpointDef;
    expect(endpoint.actions).toMatchSnapshot();
  });
  it("fails when there's an input and deny for the same field", () => {
    const bp = `
    model Org {
      field name { type string }
    }
    entrypoint Orgs {
      target Org as org
      update endpoint {
        action {
          update org as ox {
            input { name }
            deny { name }
          }
        }
      }
    }
    `;
    const spec = compileToOldSpec(bp);
    expect(() => compose(spec)).toThrowErrorMatchingInlineSnapshot(`"Found duplicates: [name]"`);
  });
  it.todo("succeeds to update through unique relation");
  it("sets default action if not given", () => {
    const bp = `
    model Org {
      field name { type string }
    }
    entrypoint Orgs {
      target Org as org
      update endpoint {}
    }
    `;
    const def = compose(compileToOldSpec(bp));
    const endpoint = def.entrypoints[0].endpoints[0] as UpdateEndpointDef;
    expect(endpoint.actions).toMatchSnapshot();
  });
  it("fails when custom action doesn't have an alias", () => {
    const bp = `
    model Org {
      field name { type string }
    }
    entrypoint Orgs {
      target Org as org
      update endpoint {
        action {
          update org {}
          create Org {}
        }
      }
    }
    `;
    const spec = compileToOldSpec(bp);
    expect(() => compose(spec)).toThrowErrorMatchingInlineSnapshot(
      `"Custom action must have an alias"`
    );
  });
  test.each(["Repo", "repo", "org"])(
    "fails when action alias uses existing model or context name %s",
    (name) => {
      const bp = `
      model Org { relation repos { from Repo, through org }}
      model Repo { reference org { to Org }}
      entrypoint O {
        target Org as org
        entrypoint R {
          target repos as repo
          create endpoint {
            action {
              create repo {}
              create Repo as ${name} {}
            }
          }
        }
      }
    `;
      const spec = compileToOldSpec(bp);
      expect(() => compose(spec)).toThrowError(
        `Cannot name an action with ${name}, name already exists in the context`
      );
    }
  );
  it.todo("gives proper error when nested cycle is detected");
  // create user { create profile { create user {} } }

  it("creates actions in custom endpoint", () => {
    const bp = `
    model Org { field name { type string } }
    model Log {}

    entrypoint Orgs {
      target Org as org

      custom endpoint {
        cardinality one
        method GET
        path "customGet"
      }
      custom endpoint {
        cardinality one
        method PATCH
        path "customUpdate"

        action {
          update {}
        }
      }
      custom endpoint {
        cardinality one
        method DELETE
        path "customDelete"

        action {
          delete {}
        }
      }

      custom endpoint {
        cardinality many
        method GET
        path "customList"
      }
      custom endpoint {
        cardinality many
        method POST
        path "customCreate"

        action {
          create {}
        }
      }
    }
    `;

    const def = compose(compileToOldSpec(bp));
    const endpoints = def.entrypoints[0].endpoints;

    expect(endpoints).toMatchSnapshot();
  });

  // --- test missing/unallowed endpoint properties
  _.chain<EndpointBodyAST["kind"][]>(["cardinality", "method", "path"])
    .forEach((property) => {
      it(`fails when "${property}" property is missing in custom endpoint`, () => {
        const bp = `
          model Org { field name { type string } }
          model Log {}

          entrypoint Orgs {
            target Org as org
            custom endpoint {
              // in each iteration skip one property
              ${property === "cardinality" ? "" : "cardinality many"}
              ${property === "method" ? "" : "method POST"}
              ${property === "path" ? "" : 'path "somePath"'}

              action {
                create Log as log {}
              }
            }
          }
        `;

        expect(() => compose(compileToOldSpec(bp))).toThrowError(
          `Property "${property}" is required for custom endpoints`
        );
      });

      _.chain<EndpointType[]>(["get", "list", "create", "update", "delete"])
        .forEach((epType) => {
          it(`fails when "${property}" property is used in "${epType}" endpoint`, () => {
            const bp = `
              model Org {}

              entrypoint Orgs {
                target Org
                ${epType} endpoint {
                  // show one property in each iteration
                  ${property === "cardinality" ? "cardinality many" : ""}
                  ${property === "method" ? "method POST" : ""}
                  ${property === "path" ? 'path "somePath"' : ""}
                }
              }
            `;

            expect(() => compose(compileToOldSpec(bp))).toThrowError(
              `Property "${property}" is not allowed for "${epType}" endpoints`
            );
          });
        })
        .value();
    })
    .value();

  // --- test invalid action types in custom endpoints
  _.chain<[EndpointCardinality, ActionKindAST[]]>([
    ["one", ["create"]],
    ["many", ["update", "delete"]],
  ])
    .map(([cardinality, actions]) => {
      console.log("endpoint", cardinality);

      return _.map(actions, (a): [EndpointCardinality, ActionKindAST] => [cardinality, a]);
    })
    .flatMap()
    .forEach(([cardinality, action]) => {
      it(`fails when creating "${cardinality}" endpoint with unallowed action "${action}"`, () => {
        const bp = `
        model Org {}
        model Log {}

        entrypoint Orgs {
          target Org as org
          custom endpoint {
            cardinality ${cardinality}
            method POST
            path "somePath"

            action {
              ${action} org {}
            }
          }
        }
        `;

        expect(() => compose(compileToOldSpec(bp))).toThrowError(
          `"custom-${cardinality}" endpoint does not allow "${action}" action`
        );
      });
    })
    .value();

  it(`fails on duplicate endpoint paths`, () => {
    const bp = `
      model Org {}

      entrypoint Orgs {
        target Org as org

        custom endpoint {
          cardinality many
          method POST
          path "someDuplicatePath"
        }

        custom endpoint {
          cardinality many
          method POST
          path "someDuplicatePath"
        }
      }
      `;

    expect(() => compose(compileToOldSpec(bp))).toThrowError(
      `Custom endpoints on the same HTTP method must have unique paths in one entrypoint ("Orgs")`
    );
  });
});

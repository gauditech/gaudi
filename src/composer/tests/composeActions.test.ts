import _ from "lodash";

import { compileToOldSpec, compose } from "@src/index";
import { CreateEndpointDef, UpdateEndpointDef } from "@src/types/definition";

describe("compose actions", () => {
  describe("native actions", () => {
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
          create as org {
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
          create as repo {}
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
          update {}
          update issue.repo.org as org {}
        }
      }
    }
    `;
      const def = compose(compileToOldSpec(bp));
      const endpoint = def.entrypoints[0].endpoints[0] as UpdateEndpointDef;
      expect(endpoint.actions).toMatchSnapshot();
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
    it("succeeds when virtual input is defined and referenced", () => {
      const bp = `
    model Org { field name { type string } }

    entrypoint Orgs {
      target Org as org
      create endpoint {
        action {
          create as org {
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
    it.todo("gives proper error when nested cycle is detected");
    // create user { create profile { create user {} } }
  });

  // ----- custom actions

  describe("custom actions", () => {
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
          update org as newOrg {}
        }
      }
      custom endpoint {
        cardinality one
        method DELETE
        path "customDelete"

        action {
          delete org {}
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
          create Org as org {}
        }
      }
    }
    `;

      const def = compose(compileToOldSpec(bp));
      const endpoints = def.entrypoints[0].endpoints;

      expect(endpoints).toMatchSnapshot();
    });
  });
});

describe("action compiler error", () => {
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
    expect(() => compileToOldSpec(bp)).toThrowErrorMatchingInlineSnapshot(
      `"When overriding default action it must match with current endpoint"`
    );
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
          create as repo {
            set org_id 1
            set org org
          }
        }
      }
    }
  }
  `;
    expect(() => compileToOldSpec(bp)).toThrowErrorMatchingInlineSnapshot(
      `"Field used multiple times in a single action"`
    );
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
    expect(() => compileToOldSpec(bp)).toThrowErrorMatchingInlineSnapshot(
      `"Field used multiple times in a single action"`
    );
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
    expect(() => compileToOldSpec(bp)).toThrowErrorMatchingInlineSnapshot(
      `"Field used multiple times in a single action"`
    );
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
        update {}
        create Org {}
      }
    }
  }
  `;
    expect(() => compileToOldSpec(bp)).toThrowErrorMatchingInlineSnapshot(
      `"Non default "create" or "update" actions require alias"`
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
            create as repo {}
            create Repo as ${name} {}
          }
        }
      }
    }
  `;
      expect(() => compileToOldSpec(bp)).toThrowError(
        `This name is already defined in current scope`
      );
    }
  );
  // --- test missing/unallowed endpoint properties
  ["cardinality", "method", "path"].forEach((property) => {
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

      expect(() => compileToOldSpec(bp)).toThrowError(`'endpoint' must contain a '${property}'`);
    });

    ["get", "list", "create", "update", "delete"].forEach((epType) => {
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

        expect(() => compileToOldSpec(bp)).toThrowError(
          `Only custom endpoint can have method, cardinality and path configuration`
        );
      });
    });
  });

  // --- test invalid action types in custom endpoints
  it(`fails when creating "one" endpoint with unallowed action "create"`, () => {
    const bp = `
        model Org {}
        model Log {}

        entrypoint Orgs {
          target Org as org
          custom endpoint {
            cardinality one
            method POST
            path "somePath"

            action {
              create org as org2 {}
            }
          }
        }
        `;

    expect(() => compileToOldSpec(bp)).toThrowError(
      `This target is not supported in a 'create' action, 'create' can only have model and relation as a target`
    );
  });

  ["update org as org2", "delete org"].forEach((action) => {
    it(`fails when creating "many" endpoint with unallowed action "${action}"`, () => {
      const bp = `
      model Org {}
      model Log {}

      entrypoint Orgs {
        target Org as org
        custom endpoint {
          cardinality many
          method POST
          path "somePath"

          action {
            ${action} {}
          }
        }
      }
      `;

      expect(() => compileToOldSpec(bp)).toThrowError(`This name does not exist in current scope`);
    });
  });

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

    expect(() => compileToOldSpec(bp)).toThrowError(
      `Custom endpoints on the same HTTP method must have unique paths in one entrypoint`
    );
  });
});

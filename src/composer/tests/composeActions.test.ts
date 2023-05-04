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

    api Client {
      entrypoint Org as org {
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
    api Client {
      entrypoint Org as org {
        update endpoint {
          action {
            update org as ox {
              set name "new name"
              deny { uuid }
            }
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
    api Client {
      entrypoint Org {
        create endpoint {
          action {
            create {
              set name3 name2
              set name2 name
            }
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
    api Client {
      entrypoint Org as myorg {
        entrypoint repos as myrepo {
          create endpoint {}
        }
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

    api Client {
      entrypoint Repo as repo {
        create endpoint {
          action {
            create as repo {}
            create repo.org.logs as log {}
          }
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

    api Client {
      entrypoint Issue as issue {
        update endpoint {
          action {
            update {}
            update issue.repo.org as org {}
          }
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
    api Client {
      entrypoint Org as org {
        update endpoint {
          action {
            update org as ox {
              set name "new name"
              input { description { optional } }
              reference extras through name
            }
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
    api Client {
      entrypoint Org as org {
        create endpoint {
          action {
            create {
              set name "new name"
              set description name + " is great"
              set descLength length(description) + 1
            }
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

    api Client {
      entrypoint Org as org {
        create endpoint {
          action {
            create as org {
              virtual input iname { type string, validate { min 4 } }
              set name "Mr/Mrs " + iname
            }
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
    api Client {
      entrypoint Org as org {
        update endpoint {}
      }
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

    api Client {
      entrypoint Org as org {

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
    }
    `;

      const def = compose(compileToOldSpec(bp));
      const endpoints = def.entrypoints[0].endpoints;

      expect(endpoints).toMatchSnapshot();
    });
  });
});

import _ from "lodash";

import { compileFromString } from "@compiler/common/testUtils";
import { CreateEndpointDef, UpdateEndpointDef } from "@compiler/types/definition";

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

    api {
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
      const def = compileFromString(bp);
      const endpoint = def.apis[0].entrypoints[0].endpoints[0] as CreateEndpointDef;
      expect(endpoint.actions).toMatchSnapshot();
    });

    it("create action doesn't produce inputs for fields with default", () => {
      const bp = `
      model Org {
        field name { type string, default "my name" }
        field description { type string, nullable }
      }
      api {
        entrypoint Org {
          create endpoint {}
        }
      }
      `;
      const def = compileFromString(bp);
      const endpoint = def.apis[0].entrypoints[0].endpoints[0] as CreateEndpointDef;
      expect(endpoint.fieldset).toMatchSnapshot();
    });

    it("succeeds with nested sibling reference", () => {
      const bp = `
    model Org {
      field name3 { type string }
      field name2 { type string }
      field name { type string }
    }
    api {
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
      const def = compileFromString(bp);
      const endpoint = def.apis[0].entrypoints[0].endpoints[0] as CreateEndpointDef;
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
    api {
      entrypoint Org as myorg {
        entrypoint repos as myrepo {
          create endpoint {}
        }
      }
    }
    `;
      const def = compileFromString(bp);
      const endpoint = def.apis[0].entrypoints[0].entrypoints[0].endpoints[0] as CreateEndpointDef;
      expect(endpoint.actions).toMatchSnapshot();
    });

    it("can create nested relations through transient references", () => {
      const bp = `
    model Org { relation repos { from Repo, through org } relation logs { from OrgLog, through org } }
    model Repo { reference org { to Org } field name { type string } }
    model OrgLog { reference org { to Org } }

    api {
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
      const def = compileFromString(bp);
      const endpoint = def.apis[0].entrypoints[0].endpoints[0] as CreateEndpointDef;
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

    api {
      entrypoint Issue as issue {
        update endpoint {
          action {
            update {}
            update issue.repo.org as org {
              input { name }
            }
          }
        }
      }
    }
    `;
      const def = compileFromString(bp);
      const endpoint = def.apis[0].entrypoints[0].endpoints[0] as UpdateEndpointDef;
      expect(endpoint.actions).toMatchSnapshot();
    });
    it("correctly implements default values", () => {
      const bp = `
    model Org {
      field name { type string }
      field description { type string }
      field uuid { type string }
      reference extras { to OrgExtra, unique }
    }
    model OrgExtra {
      field name { type string, unique }
      relation org { from Org, through extras }
    }
    api {
      entrypoint Org as org {
        update endpoint {
          action {
            update org as ox {
              set uuid "new uuid"
              input { description { required }, name }
              reference extras through name
            }
          }
        }
        create endpoint {
          action {
            create Org as ox {
              input { uuid { default "uuid-" + stringify(now()) } }
            }
          }
        }
      }
    }`;
      const def = compileFromString(bp);
      const endpoints = def.apis[0].entrypoints[0].endpoints;
      expect(endpoints[0]).toMatchSnapshot("update");
      expect(endpoints[1]).toMatchSnapshot("create");
    });
    it("succeeds with arithmetic expressions in setters", () => {
      const bp = `
    model Org {
      field name { type string }
      field description { type string }
      field descLength { type integer }
    }
    api {
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
      const def = compileFromString(bp);
      const endpoint = def.apis[0].entrypoints[0].endpoints[0] as UpdateEndpointDef;
      expect(endpoint.actions).toMatchSnapshot();
    });
    it("succeeds when extra input is defined and referenced", () => {
      const bp = `
    model Org { field name { type string } }

    api {
      entrypoint Org as org {
        create endpoint {
          extra inputs {
            field iname { type string, validate { minLength(4) } }
          }
          action {
            create as org {
              set name "Mr/Mrs " + iname
            }
          }
        }
      }
    }
    `;

      const def = compileFromString(bp);
      const endpoint = def.apis[0].entrypoints[0].endpoints[0] as CreateEndpointDef;
      expect(endpoint.actions).toMatchSnapshot();
      expect(endpoint.fieldset).toMatchSnapshot();
    });
    it("sets default action if not given", () => {
      const bp = `
    model Org {
      field name { type string }
    }
    api {
      entrypoint Org as org {
        update endpoint {}
      }
    }
    `;
      const def = compileFromString(bp);
      const endpoint = def.apis[0].entrypoints[0].endpoints[0] as UpdateEndpointDef;
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

    api {
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
            update org as newOrg { input { name } }
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

      const def = compileFromString(bp);
      const endpoints = def.apis[0].entrypoints[0].endpoints;

      expect(endpoints).toMatchSnapshot();
    });
  });
});

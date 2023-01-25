import { compile, compose, parse } from "@src/index";
import { CreateEndpointDef, UpdateEndpointDef } from "@src/types/definition";

describe("custom actions", () => {
  it("succeeds for basic composite create", () => {
    const bp = `
    model Org {
      field is_new { type boolean }
      field name { type text }
      reference extras { to OrgExtra, unique }
    }
    model OrgExtra {
      relation org { from Org, through extras }
    }
    model OrgOwner { reference org { to Org } }

    entrypoint Orgs {
      target model Org as org
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
    const def = compose(compile(parse(bp)));
    const endpoint = def.entrypoints[0].endpoints[0] as CreateEndpointDef;
    expect(endpoint.actions).toMatchSnapshot();
  });
  it("succeeds for basic update with a deny rule", () => {
    const bp = `
    model Org {
      field name { type text }
      field description { type text }
      field uuid { type text }
      reference extras { to OrgExtra, unique }
    }
    model OrgExtra {
      relation org { from Org, through extras }
    }
    entrypoint Orgs {
      target model Org as org
      update endpoint {
        action {
          update org as ox {
            set name "new name"
            deny { uuid }
          }
        }
      }
    }`;
    const def = compose(compile(parse(bp)));
    const endpoint = def.entrypoints[0].endpoints[0] as UpdateEndpointDef;
    expect(endpoint.actions).toMatchSnapshot();
  });
  it("succeeds with nested sibling reference", () => {
    const bp = `
    model Org {
      field name { type text }
      field name2 { type text }
      field name3 { type text }
    }
    entrypoint Org {
      target model Org
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
    const def = compose(compile(parse(bp)));
    const endpoint = def.entrypoints[0].endpoints[0] as CreateEndpointDef;
    expect(endpoint.actions).toMatchSnapshot();
    expect(endpoint.fieldset).toMatchSnapshot();
  });
  it("fails when reference and its field are being set at the same time", () => {
    const bp = `
    model Org { relation repos { from Repo, through org }}
    model Repo { reference org { to Org }}
    entrypoint Org {
      target model Org as org
      entrypoint Repos {
        target relation repos as repo
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
    const spec = compile(parse(bp));
    expect(() => compose(spec)).toThrowErrorMatchingInlineSnapshot(`"Found duplicates: [org_id]"`);
  });
  it("correctly sets parent context", () => {
    const bp = `
    model Org {
      relation repos { from Repo, through org }
    }
    model Repo {
      reference org { to Org }
      field name { type text }
    }
    entrypoint Orgs {
      target model Org as myorg
      entrypoint Repos {
        target relation repos as myrepo
        create endpoint {}
      }
    }
    `;
    const def = compose(compile(parse(bp)));
    const endpoint = def.entrypoints[0].entrypoints[0].endpoints[0] as CreateEndpointDef;
    expect(endpoint.actions).toMatchSnapshot();
  });

  it("can create nested relations through transient references", () => {
    const bp = `
    model Org { relation repos { from Repo, through org }; relation logs { from OrgLog, through org } }
    model Repo { reference org { to Org }; field name { type text } }
    model OrgLog { reference org { to Org } }

    entrypoint R {
      target model Repo as repo
      create endpoint {
        action {
          create repo {}
          create repo.org.logs as log {}
        }
      }
    }
    `;
    const def = compose(compile(parse(bp)));
    const endpoint = def.entrypoints[0].endpoints[0] as CreateEndpointDef;
    expect(endpoint.actions).toMatchSnapshot();
  });
  it("can update deeply nested references", () => {
    const bp = `
    model Org {
      field name { type text }
      relation repos { from Repo, through org }
    }
    model Repo { reference org { to Org }; relation issues { from Issue, through repo } }
    model Issue { reference repo { to Repo } }

    entrypoint I {
      target model Issue as issue
      update endpoint {
        action {
          update issue {}
          update issue.repo.org as org {}
        }
      }
    }
    `;
    const def = compose(compile(parse(bp)));
    const endpoint = def.entrypoints[0].endpoints[0] as UpdateEndpointDef;
    expect(endpoint.actions).toMatchSnapshot();
  });
  it("fails when default action override is invalid type", () => {
    const bp = `
    model Org {
      field name { type text }
    }
    entrypoint Orgs {
      target model Org
      update endpoint {
        action {
          create {}
        }
      }
    }`;
    const spec = compile(parse(bp));
    expect(() => compose(spec)).toThrowErrorMatchingInlineSnapshot(
      `"Mismatching context action: overriding update endpoint with a create action"`
    );
  });
  it("succeeds with custom inputs", () => {
    const bp = `
    model Org {
      field name { type text }
      field description { type text }
      field uuid { type text }
      reference extras { to OrgExtra, unique }
    }
    model OrgExtra {
      field name { type text }
      relation org { from Org, through extras }
    }
    entrypoint Orgs {
      target model Org as org
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
    const def = compose(compile(parse(bp)));
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
      target model Org as org
      update endpoint {
        action {
          update org as ox {
            input { extras_id }
            reference extras through id
          }
        }
      }
    }`;
    const spec = compile(parse(bp));
    expect(() => compose(spec)).toThrowErrorMatchingInlineSnapshot(
      `"Found duplicates: [extras_id]"`
    );
  });
  it("fails when there's an input and deny for the same field", () => {
    const bp = `
    model Org {
      field name { type text }
    }
    entrypoint Orgs {
      target model Org as org
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
    const spec = compile(parse(bp));
    expect(() => compose(spec)).toThrowErrorMatchingInlineSnapshot(`"Found duplicates: [name]"`);
  });
  it.todo("succeeds to update through unique relation");
  it("sets default action if not given", () => {
    const bp = `
    model Org {
      field name { type text }
    }
    entrypoint Orgs {
      target model Org as org
      update endpoint {}
    }
    `;
    const def = compose(compile(parse(bp)));
    const endpoint = def.entrypoints[0].endpoints[0] as UpdateEndpointDef;
    expect(endpoint.actions).toMatchSnapshot();
  });
  it("fails when custom action doesn't have an alias", () => {
    const bp = `
    model Org {
      field name { type text }
    }
    entrypoint Orgs {
      target model Org as org
      update endpoint {
        action {
          update org {}
          create Org {}
        }
      }
    }
    `;
    const spec = compile(parse(bp));
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
        target model Org as org
        entrypoint R {
          target relation repos as repo
          create endpoint {
            action {
              create repo {}
              create Repo as ${name} {}
            }
          }
        }
      }
    `;
      const spec = compile(parse(bp));
      expect(() => compose(spec)).toThrowError(
        `Cannot name an action with ${name}, name already exists in the context`
      );
    }
  );
  it.todo("gives proper error when nested cycle is detected");
  // create user { create profile { create user {} } }
});

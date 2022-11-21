import { compile, compose, parse } from "@src/index";

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
    entrypoint Orgs {
      target model Org as org
      create endpoint {
        action {
          create OrgExtra as e {}
          create org {
            set is_new true
            set extras e
          }
        }
      }
    }
    `;
    const def = compose(compile(parse(bp)));
    const actions = def.entrypoints[0].endpoints[0].actions;
    expect(actions).toMatchSnapshot();
  });
  it("succeeds for basic update", () => {
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
    const actions = def.entrypoints[0].endpoints[0].actions;
    expect(actions).toMatchSnapshot();
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
    const actions = def.entrypoints[0].entrypoints[0].endpoints[0].actions;
    expect(actions).toMatchSnapshot();
  });

  it.skip("progress", () => {
    const bp = `
    model User {
      reference profile { to Profile, unique }
      field name { type text }
    }
    model Profile {
      field address { type text }
      relation user { from User, through profile }
    }
    entrypoint Users {
      target model User as user
      update endpoint {
        action {
          update user {
          }
          update user.profile {}
        }
      }
    }`;
    const def = compose(compile(parse(bp)));
    const actions = def.entrypoints[0].endpoints[0].actions;
    expect(actions).toMatchInlineSnapshot();
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
            deny { extras_id }
          }
        }
      }
    }`;
    const def = compose(compile(parse(bp)));
    const actions = def.entrypoints[0].endpoints[0].actions;
    expect(actions).toMatchSnapshot();
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
      `"Cannot reference and input the same field"`
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
    expect(() => compose(spec)).toThrowErrorMatchingInlineSnapshot(
      `"Overlapping inputs and deny rule"`
    );
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
    const actions = def.entrypoints[0].endpoints[0].actions;
    expect(actions).toMatchSnapshot();
  });
  it("fails when action alias is not given", () => {
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
      `"We currently require every custom action to have an explicit alias"`
    );
  });
  test.each(["Repo", "repo", "org"])(
    "fails when action alias uses existing model or context name",
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

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
    const endpoint = def.entrypoints[0].endpoints[0];
    expect(endpoint.actions).toMatchSnapshot();
  });
  it("succeeds for basic update", () => {
    const bp = `
    model Org {
      field name { type text }
    }
    entrypoint Orgs {
      target model Org as org
      update endpoint {
        action {
          update org as ox {
            set name "new name"
          }
        }
      }
    }`;
    const def = compose(compile(parse(bp)));
    const endpoint = def.entrypoints[0].endpoints[0];
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
  it.todo("sets default action if not given");
});

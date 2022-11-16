import { compile, compose, parse } from "@src/index";

describe("custom actions", () => {
  it("progress", () => {
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
      target model Org
      create endpoint {
        action {
          create OrgExtra as e {}
          create {
            set is_new true
            set extras e
          }
        }
      }
    }
    `;
    const def = compose(compile(parse(bp)));
    const endpoint = def.entrypoints[0].endpoints[0];
    expect(endpoint.actions).toMatchInlineSnapshot(`
      [
        {
          "alias": "e",
          "changeset": {},
          "kind": "create-one",
          "model": "OrgExtra",
          "response": [],
        },
        {
          "alias": undefined,
          "changeset": {
            "extras": {
              "kind": "reference-value",
              "target": {
                "access": [
                  "id",
                ],
                "alias": "e",
              },
              "type": "integer",
            },
            "is_new": {
              "kind": "value",
              "type": "boolean",
              "value": true,
            },
          },
          "kind": "create-one",
          "model": "Org",
          "response": [],
        },
      ]
    `);
  });
  it.todo("fails when default action override is invalid type");
  it.todo("sets default action if not given");
});

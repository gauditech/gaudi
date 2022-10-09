import { compile, compose, parse } from "@src/index";
import { EntrypointDef } from "@src/types/definition";

describe("entrypoint", () => {
  it("composes basic example", () => {
    const bp = `
    model Org {
      field slug { type text, unique }
      field name { type text }
      relation repos { from Repo, through org }
    }
    model Repo {
      reference org { to Org }
      field title { type text }
    }

    entrypoint Orgs {
      target model Org
      identify with slug
      response { id, name, slug }
    
      list endpoint {}
      get endpoint {}
    
      entrypoint Repositories {
        target relation repos as repo

        list endpoint {}
        get endpoint {}
        create endpoint {}
      }
    }
    `;
    const spec = compile(parse(bp));
    const def = compose(spec);
    const ep: EntrypointDef[] = [
      {
        target: {
          kind: "model",
          name: "Org",
          refKey: "Org",
          type: "Org",
          identifyWith: { name: "slug", refKey: "Org.slug", type: "text" },
          alias: null,
        },
        name: "Orgs",
        endpoints: [
          {
            kind: "list",
            response: {
              fieldRefs: ["Org.id", "Org.name", "Org.slug"],
              references: [],
              relations: [],
              queries: [],
            },
          },
          {
            kind: "get",
            response: {
              fieldRefs: ["Org.id", "Org.name", "Org.slug"],
              references: [],
              relations: [],
              queries: [],
            },
          },
        ],
        entrypoints: [
          {
            name: "Orgs.Repositories",
            target: {
              kind: "relation",
              name: "repos",
              refKey: "Org.repos",
              type: "Repo",
              alias: "repo",
              identifyWith: { name: "id", refKey: "Repo.id", type: "integer" },
            },
            endpoints: [
              {
                kind: "list",
                response: {
                  fieldRefs: ["Repo.id", "Repo.title", "Repo.org_id"],
                  references: [],
                  relations: [],
                  queries: [],
                },
              },
              {
                kind: "get",
                response: {
                  fieldRefs: ["Repo.id", "Repo.title", "Repo.org_id"],
                  references: [],
                  relations: [],
                  queries: [],
                },
              },
              {
                kind: "create",
                fieldset: { fields: { title: { kind: "field", nullable: false, type: "text" } } },
                contextActionChangeset: {
                  org_id: {
                    kind: "reference-value",
                    type: "integer",
                    target: { alias: "org", access: ["id"] },
                  },
                  title: { kind: "fieldset-input", type: "text", fieldsetAccess: ["title"] },
                },
                actions: [],
                response: {
                  fieldRefs: ["Repo.id", "Repo.title", "Repo.org_id"],
                  references: [],
                  relations: [],
                  queries: [],
                },
              },
            ],
            entrypoints: [],
          },
        ],
      },
    ];
    expect(def.entrypoints).toStrictEqual(ep);
  });
});

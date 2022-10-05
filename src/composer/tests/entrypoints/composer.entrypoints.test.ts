import { compile, compose, parse } from "@src/index";
import { EntrypointDef } from "@src/types/definition";

describe("entrypoint", () => {
  it.skip("composes basic example", () => {
    const bp = `
    model Org {
      field name { type text }
    }

    entrypoint Orgs {
      target model Org
      response{ id, name }
      list endpoint {}
      get endpoint {}
    }
    `;
    const spec = compile(parse(bp));
    const def = compose(spec);
    const ep: EntrypointDef[] = [
      {
        name: "Orgs",
        targetModelRef: "Org",
        endpoints: [
          {
            name: "list",
            kind: "list",
            path: [{ type: "literal", value: "org" }],
            actions: [
              {
                kind: "fetch many",
                modelRef: "Org",
                filter: undefined,
                select: {
                  fieldRefs: ["Org.id", "Org.name"],
                  queries: [],
                  references: [],
                  relations: [],
                },
                varname: "var0",
              },
              { kind: "respond", varname: "var0" },
            ],
          },
          {
            name: "get",
            kind: "get",
            identifyRefPath: ["Org.id"], // should not use this
            path: [
              { type: "literal", value: "org" },
              { type: "numeric", varname: "org_id" },
            ],
            actions: [
              {
                kind: "fetch one",
                modelRef: "Org",
                filter: {
                  // this needs more work, not only expanding the options but define joins for nested lookups
                  kind: "binary",
                  operation: "is",
                  lhs: "Org.id",
                  rhs: { kind: "var ref", varname: "org_id" },
                },
                select: {
                  fieldRefs: ["Org.id", "Org.name"],
                  queries: [],
                  references: [],
                  relations: [],
                },
                varname: "var0",
                onError: { statusCode: 404, body: { message: "Not found" } },
              },
              { kind: "respond", varname: "var0" },
            ],
          },
        ],
      },
    ];
    expect(def.entrypoints).toStrictEqual(ep);
  });
});

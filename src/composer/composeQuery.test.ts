import { compose } from "./composer";

import { compile } from "@src/compiler/compiler";
import { parse } from "@src/parser/parser";

describe("compose model queries", () => {
  it("nested example without filters", () => {
    const bp = `
    model Org {
      relation repos { from Repo, through org }
      query back_to_org { from repos.org }
    }
    model Repo {
      reference org { to Org }
    }
    `;
    const def = compose(compile(parse(bp)));
    expect(def.models[0].queries).toStrictEqual([
      {
        refKey: "Org.back_to_org",
        name: "back_to_org",
        retCardinality: "many",
        retType: "Org",
        nullable: false,
        path: [
          {
            alias: "r0",
            bpAlias: null,
            name: "repos",
            nullable: false,
            path: [],
            refCardinality: "many",
            refKey: "Org.repos",
            retType: "Repo",
            select: [],
          },
          {
            alias: "o1",
            bpAlias: null,
            name: "org",
            nullable: false,
            path: [],
            refCardinality: "one",
            refKey: "Repo.org",
            retType: "Org",
            select: [],
          },
        ],
        filters: [],
      },
    ]);
  });
  it("nested example with filters", () => {
    const bp = `
    model Org {
      relation repos { from Repo, through org }
      query repos_if_one { from repos, filter { org.id is 1 and is_active } }
    }
    model Repo {
      field is_active { type boolean }
      reference org { to Org }
    }
    `;
    const def = compose(compile(parse(bp)));
    expect(def.models[0].queries).toStrictEqual([
      {
        refKey: "Org.repos_if_one",
        name: "repos_if_one",
        retCardinality: "many",
        retType: "Repo",
        nullable: false,
        path: [
          {
            name: "repos",
            refKey: "Org.repos",
            refCardinality: "many",
            retType: "Repo",
            alias: "r0",
            bpAlias: null,
            nullable: false,
            path: [
              {
                name: "org",
                refKey: "Repo.org",
                refCardinality: "one",
                retType: "Org",
                alias: "r0.o0",
                bpAlias: null,
                nullable: false,
                path: [],
                select: [
                  { type: "integer", name: "id", refKey: "Org.id" },
                  { type: "boolean", name: "is_active", refKey: "Org.is_active" },
                ],
              },
            ],
            select: [],
          },
        ],
        filters: [
          // { type: "numeric", lhs: "r0.p0.id", rhs: 1 },
          // { type: "boolean", lhs: "r0.p0.is_active", rhs: true },
        ],
      },
    ]);
  });
});

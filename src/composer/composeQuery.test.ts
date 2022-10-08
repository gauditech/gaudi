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
        joinPaths: [
          {
            namePath: ["repos"],
            bpAlias: null,
            name: "repos",
            nullable: false,
            joinPaths: [
              {
                namePath: ["repos", "org"],
                bpAlias: null,
                name: "org",
                nullable: false,
                joinPaths: [],
                joinType: "inner",
                retCardinality: "one",
                refKey: "Repo.org",
                retType: "Org",
                select: [],
              },
            ],
            joinType: "inner",
            retCardinality: "many",
            refKey: "Org.repos",
            retType: "Repo",
            select: [],
          },
        ],
        filter: undefined,
      },
    ]);
  });
  it("example with nested filters", () => {
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
        joinPaths: [
          {
            name: "repos",
            refKey: "Org.repos",
            retCardinality: "many",
            retType: "Repo",
            namePath: ["repos"],
            bpAlias: null,
            nullable: false,
            select: [
              {
                refKey: "Repo.is_active",
                name: "is_active",
                namePath: ["repos", "is_active"],
                retType: "boolean",
                nullable: false,
              },
            ],
            joinType: "inner",
            joinPaths: [
              {
                name: "org",
                refKey: "Repo.org",
                retCardinality: "one",
                retType: "Org",
                namePath: ["repos", "org"],
                bpAlias: null,
                nullable: false,
                select: [
                  {
                    refKey: "Org.id",
                    name: "id",
                    namePath: ["repos", "org", "id"],
                    retType: "integer",
                    nullable: false,
                  },
                ],
                joinType: "inner",
                joinPaths: [],
              },
            ],
          },
        ],
        filter: {
          kind: "binary",
          lhs: {
            kind: "binary",
            lhs: {
              kind: "alias",
              namePath: ["org", "id"],
            },
            operator: "is",
            rhs: {
              kind: "literal",
              type: "integer",
              value: 1,
            },
          },
          operator: "and",
          rhs: {
            kind: "alias",
            namePath: ["is_active"],
            // FIXME this should compare `is_active` with true!!
          },
        },
      },
    ]);
  });
});

import { QueryPlan, QueryPlanExpression, collectShalowDeps } from "./sqlstringify/queryPlan";
import { collectPaths } from "./stringify";

import { compileToOldSpec } from "@src/compiler";
import { compose } from "@src/composer/composer";
import { FunctionName } from "@src/types/definition";

describe("Queryviews", () => {
  const bp = `
  model Org {
    field name { type string }
    relation repos { from Repo, through org }

    computed total_issues { count(repos.issues) }
  }
  
  model Repo {
    reference org { to Org }
    field name { type string }
    field ref_number { type integer }
    relation issues { from Issues, through repo }

    computed org_name { org.name }
    computed org_total_issues { org.total_issues + 1 }
  }
  
  model Issues {
    field name { type string }
    reference repo { to Repo }

    computed repo_name { repo.name }
  }
  
  query OrgsReposIssues {
    from Org.repos,
    filter {
      count(issues.id) // fixme it should work without '.id' as well
      + count(issues.repo.id) + sum(issues.id) > count(issues.repo_name) + ref_number
    },
    select { id, name, org_name }
  }

  // fetch repos that contain more than 10% of all the issues in their org
  query ReposWithManyIssues {
    from Repo,
    filter {
      count(issues) * 10 > count(org.repos.issues)
    }
  }

  query OrgsNestedAggr {
    from Org,
    filter {
      sum(repos.org_total_issues) > 100
    },
    select { id }
  }
  `;

  const def = compose(compileToOldSpec(bp));
  const q = def.views![0];

  // step 1: collect all atoms used in query

  const SHALLOW_DEPS = [
    { aggregate: null, path: ["Org", "repos", "id"] },
    { aggregate: null, path: ["Org", "repos", "name"] },
    { aggregate: null, path: ["Org", "repos", "org_name"] },
    { aggregate: "count", path: ["Org", "repos", "issues", "id"] },
    { aggregate: "count", path: ["Org", "repos", "issues", "repo", "id"] },
    { aggregate: "sum", path: ["Org", "repos", "issues", "id"] },
    { aggregate: "count", path: ["Org", "repos", "issues", "repo_name"] },
    { aggregate: null, path: ["Org", "repos", "ref_number"] },
  ];

  // step 2: expand expressions

  const DEPS = {
    atoms: [
      ["Org", "repos", "id"],
      ["Org", "repos", "name"],
      ["Org", "repos", "org_name"],
      ["Org", "repos", "ref_number"],
    ],
    expandedAtoms: [
      ["Org", "repos", "id"],
      ["Org", "repos", "name"],
      ["Org", "repos", "org", "name"],
      ["Org", "repos", "ref_number"],
    ],
    aggregates: [
      {
        sourcePath: ["Org", "repos"],
        fnName: "count",
        entry: "Repo",
        path: ["issues", "id"],
        expression: { type: "alias", value: ["issues", "id"] },
      },
      {
        sourcePath: ["Org", "repos"],
        fnName: "count",
        entry: "Repo",
        path: ["issues", "repo", "id"],
        expression: { type: "alias", value: ["issues", "repo", "id"] },
      },
      {
        sourcePath: ["Org", "repos"],
        fnName: "sum",
        entry: "Repo",
        path: ["issues", "id"],
        expression: { type: "alias", value: ["issues", "id"] },
      },
      {
        sourcePath: ["Org", "repos"],
        fnName: "count",
        entry: "Repo",
        path: ["issues", "repo_name"],
        expression: { type: "alias", value: ["issues", "repo", "name"] },
      },
    ],
  };

  // step 3: build query plan

  const QPLAN: QueryPlan = {
    entry: "Org",
    groupBy: [],
    filter: undefined, // FIXME
    select: {
      id: { kind: "alias", value: ["Org", "repos", "id"] },
      name: { kind: "alias", value: ["Org", "repos", "name"] },
      org_name: { kind: "alias", value: ["Org", "repos", "org", "name"] },
    },
    joins: [
      {
        kind: "inline",
        joinType: "inner",
        target: "repos",
        joins: [
          {
            kind: "subquery",
            joinType: "left",
            joins: [],
            plan: {
              entry: "Repo",
              groupBy: [["id"]],
              joins: [
                {
                  kind: "inline",
                  joinType: "inner",
                  target: "issues",
                  joins: [],
                },
              ],
              select: {
                __join_connection: { kind: "alias", value: ["id"] },
                result: {
                  kind: "function",
                  fnName: "count",
                  args: [{ kind: "alias", value: ["issues", "id"] }],
                },
              },
            },
          },
          {
            kind: "subquery",
            joinType: "left",
            joins: [],
            plan: {
              entry: "Repo",
              groupBy: [["id"]],
              joins: [
                {
                  kind: "inline",
                  joinType: "inner",
                  target: "issues",
                  joins: [
                    {
                      kind: "inline",
                      joinType: "inner",
                      target: "repo",
                      joins: [],
                    },
                  ],
                },
              ],
              select: {
                __join_connection: { kind: "alias", value: ["id"] },
                result: {
                  kind: "function",
                  fnName: "count",
                  args: [{ kind: "alias", value: ["issues", "repo", "id"] }],
                },
              },
            },
          },
          {
            kind: "subquery",
            joinType: "left",
            joins: [],
            plan: {
              entry: "Repo",
              groupBy: [["id"]],
              joins: [
                {
                  kind: "inline",
                  joinType: "inner",
                  target: "issues",
                  joins: [],
                },
              ],
              select: {
                __join_connection: { kind: "alias", value: ["id"] },
                result: {
                  kind: "function",
                  fnName: "sum",
                  args: [{ kind: "alias", value: ["issues", "id"] }],
                },
              },
            },
          },
          {
            kind: "subquery",
            joinType: "left",
            joins: [],
            plan: {
              entry: "Repo",
              groupBy: [["id"]],
              joins: [
                {
                  kind: "inline",
                  joinType: "inner",
                  target: "issues",
                  joins: [
                    {
                      kind: "inline",
                      joinType: "inner",
                      target: "repo",
                      joins: [],
                    },
                  ],
                },
              ],
              select: {
                __join_connection: { kind: "alias", value: ["id"] },
                result: {
                  kind: "function",
                  fnName: "count",
                  args: [{ kind: "alias", value: ["issues", "repo", "name"] }],
                },
              },
            },
          },
        ],
      },
    ],
  };

  it("composes the query", () => {
    expect(q).toMatchInlineSnapshot(`
      {
        "filter": {
          "args": [
            {
              "args": [
                {
                  "args": [
                    {
                      "args": [
                        {
                          "kind": "alias",
                          "namePath": [
                            "Org",
                            "repos",
                            "issues",
                            "id",
                          ],
                        },
                      ],
                      "kind": "function",
                      "name": "count",
                    },
                    {
                      "args": [
                        {
                          "kind": "alias",
                          "namePath": [
                            "Org",
                            "repos",
                            "issues",
                            "repo",
                            "id",
                          ],
                        },
                      ],
                      "kind": "function",
                      "name": "count",
                    },
                  ],
                  "kind": "function",
                  "name": "+",
                },
                {
                  "args": [
                    {
                      "kind": "alias",
                      "namePath": [
                        "Org",
                        "repos",
                        "issues",
                        "id",
                      ],
                    },
                  ],
                  "kind": "function",
                  "name": "sum",
                },
              ],
              "kind": "function",
              "name": "+",
            },
            {
              "args": [
                {
                  "args": [
                    {
                      "kind": "alias",
                      "namePath": [
                        "Org",
                        "repos",
                        "issues",
                        "repo_name",
                      ],
                    },
                  ],
                  "kind": "function",
                  "name": "count",
                },
                {
                  "kind": "alias",
                  "namePath": [
                    "Org",
                    "repos",
                    "ref_number",
                  ],
                },
              ],
              "kind": "function",
              "name": "+",
            },
          ],
          "kind": "function",
          "name": ">",
        },
        "fromPath": [
          "Org",
          "repos",
        ],
        "kind": "query",
        "limit": undefined,
        "modelRefKey": "Org",
        "name": "$query",
        "offset": undefined,
        "orderBy": undefined,
        "refKey": "N/A",
        "retType": "Repo",
        "select": [
          {
            "alias": "id",
            "kind": "field",
            "name": "id",
            "namePath": [
              "Org",
              "repos",
              "id",
            ],
            "refKey": "Repo.id",
          },
          {
            "alias": "name",
            "kind": "field",
            "name": "name",
            "namePath": [
              "Org",
              "repos",
              "name",
            ],
            "refKey": "Repo.name",
          },
          {
            "alias": "org_name",
            "kind": "computed",
            "name": "org_name",
            "namePath": [
              "Org",
              "repos",
              "org_name",
            ],
            "refKey": "Repo.org_name",
          },
        ],
      }
    `);
  });

  it("calculates shallow deps", () => {
    const deps = collectShalowDeps(q);
    expect(deps).toStrictEqual(SHALLOW_DEPS);
  });
  it("calculates all deps", () => {
    const deps = collectPaths(def, q);
    expect(deps).toMatchInlineSnapshot(`
      [
        [
          "Org",
          "repos",
          "id",
        ],
        [
          "Org",
          "repos",
          "ref_number",
        ],
        [
          "Org",
          "repos",
          "org",
          "name",
        ],
      ]
    `);
  });
});

import { format } from "sql-formatter";

import { QueryAtom, QueryPlan, collectQueryAtoms } from "./queryPlan";
import { queryPlanToString } from "./stringify";

import { compileToOldSpec } from "@src/compiler";
import { compose } from "@src/composer/composer";
import { CustomManyEndpointDef, Definition, FetchOneAction, QueryDef } from "@src/types/definition";

/**
 * Define a query wrapper
 */

function makeTestQuery(models: string, query: string): { def: Definition; query: QueryDef } {
  const bp = `
  ${models}
  
  model TestHelperModel {}
  entrypoint TestHelperModel {
    custom endpoint {
      method GET
      cardinality many
      path "/test"
      action {
        fetch as q {
          ${query}
        }
      }
    }
  }
  `;
  const def = compose(compileToOldSpec(bp));
  const endpoint = def.entrypoints[0].endpoints[0] as CustomManyEndpointDef;
  const action = endpoint.actions[0] as FetchOneAction;
  return { def, query: action.query };
}

describe("Query plan", () => {
  function setup() {
    const modelBp = `
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
  `;

    const queryBp = `
  query {
    from Org.repos as o.r,
    filter {
      count(r.issues.id) // fixme it should work without '.id' as well
      + count(r.issues.repo.id) + sum(r.issues.id) > count(r.issues.repo_name) + r.ref_number
      + count(o.repos.id)
    },
    select { id, name, org_name }
  }
`;

    return makeTestQuery(modelBp, queryBp);
  }

  it("composes a query", () => {
    const { query } = setup();
    expect(query).toMatchSnapshot();
  });
  it("collects atoms", () => {
    const { def, query } = setup();
    const atoms = collectQueryAtoms(def, query);
    expect(atoms).toMatchInlineSnapshot(`
      [
        {
          "kind": "table-namespace",
          "namePath": [
            "Org",
            "repos",
          ],
        },
        {
          "kind": "table-namespace",
          "namePath": [
            "Org",
            "repos",
            "org",
          ],
        },
        {
          "fnName": "count",
          "kind": "aggregate",
          "sourcePath": [
            "Org",
          ],
          "targetPath": [
            "repos",
            "id",
          ],
        },
        {
          "fnName": "count",
          "kind": "aggregate",
          "sourcePath": [
            "Org",
            "repos",
          ],
          "targetPath": [
            "issues",
            "id",
          ],
        },
        {
          "fnName": "count",
          "kind": "aggregate",
          "sourcePath": [
            "Org",
            "repos",
          ],
          "targetPath": [
            "issues",
            "repo",
            "id",
          ],
        },
        {
          "fnName": "count",
          "kind": "aggregate",
          "sourcePath": [
            "Org",
            "repos",
          ],
          "targetPath": [
            "issues",
            "repo_name",
          ],
        },
        {
          "fnName": "sum",
          "kind": "aggregate",
          "sourcePath": [
            "Org",
            "repos",
          ],
          "targetPath": [
            "issues",
            "id",
          ],
        },
      ]
    `);
    expect(atoms).toEqual(ATOMS);
  });
  it("stringifies the query plan", () => {
    // const query = setup();
    const qstr = queryPlanToString(QP);
    const final = format(qstr, { language: "postgresql" });

    expect(final).toMatchSnapshot();
  });
});

const ATOMS: QueryAtom[] = [
  { kind: "table-namespace", namePath: ["Org", "repos"] },
  { kind: "table-namespace", namePath: ["Org", "repos", "org"] },
  { kind: "aggregate", fnName: "count", sourcePath: ["Org"], targetPath: ["repos", "id"] },
  {
    kind: "aggregate",
    fnName: "count",
    sourcePath: ["Org", "repos"],
    targetPath: ["issues", "id"],
  },
  {
    kind: "aggregate",
    fnName: "count",
    sourcePath: ["Org", "repos"],
    targetPath: ["issues", "repo", "id"],
  },
  {
    kind: "aggregate",
    fnName: "count",
    sourcePath: ["Org", "repos"],
    targetPath: ["issues", "repo_name"],
  },

  { kind: "aggregate", fnName: "sum", sourcePath: ["Org", "repos"], targetPath: ["issues", "id"] },
];

const QP: QueryPlan = {
  /**
   * Start main query, Org->repos->org
   */
  entry: "Org",
  groupBy: [],
  filter: {
    kind: "function",
    fnName: ">",
    args: [
      // count(r.issues) + count(r.issues.repo.id) + sum(r.issues.id)
      {
        kind: "function",
        fnName: "+",
        args: [
          // count(r.issues)
          {
            kind: "alias",
            value: ["Org", "repos", "COUNT", "issues", "id", "result"],
          },
          // count(r.issues.repo.id) + sum(r.issues.id)
          {
            kind: "function",
            fnName: "+",
            args: [
              // count(r.issues.repo.id)
              {
                kind: "alias",
                value: ["Org", "repos", "COUNT", "issues", "repo", "id", "result"],
              },
              // sum(r.issues.id)
              {
                kind: "alias",
                value: ["Org", "repos", "SUM", "issues", "id", "result"],
              },
            ],
          },
        ],
      },
      // count(r.issues.repo_name) + r.ref_number + count(o.repos.id)
      {
        kind: "function",
        fnName: "+",
        args: [
          // count(r.issues.repo_name)
          {
            kind: "alias",
            value: ["Org", "repos", "COUNT", "issues", "repo_name", "result"],
          },
          // r.ref_number + count(o.repos.id)
          {
            kind: "function",
            fnName: "+",
            args: [
              // r.ref_number
              {
                kind: "alias",
                value: ["Org", "repos", "ref_number"],
              },
              // count(o.repos.id)
              {
                kind: "alias",
                value: ["Org", "COUNT", "repos", "id", "result"],
              },
            ],
          },
        ],
      },
    ],
  },
  select: {
    id: { kind: "alias", value: ["Org", "repos", "id"] },
    name: { kind: "alias", value: ["Org", "repos", "name"] },
    org_name: { kind: "alias", value: ["Org", "repos", "org", "name"] },
  },
  joins: [
    /**
     * Main query, join Org->repos
     */
    {
      kind: "inline",
      joinType: "inner",
      joinOn: [
        ["Org", "id"],
        ["Org", "repos", "org_id"],
      ],
      modelName: "Repo",
      target: "repos",
      namePath: ["Org", "repos"],
    },
    /**
     * Main query, join [Org->]repos->org
     */
    {
      kind: "inline",
      joinType: "inner",
      joinOn: [
        ["Org", "repos", "org_id"],
        ["Org", "repos", "org", "id"],
      ],
      modelName: "Org",
      namePath: ["Org", "repos", "org"],
      target: "org",
    },
    /**
     * Aggregate query Org->repos->count(issues.id)
     */
    {
      kind: "subquery",
      joinType: "inner",
      namePath: ["Org", "repos", "COUNT", "issues", "id"],
      joinOn: [
        ["Org", "repos", "id"],
        ["Org", "repos", "COUNT", "issues", "id", "__join_connection"],
      ],
      plan: {
        entry: "Repo",
        groupBy: [["Repo", "id"]],
        select: {
          __join_connection: { kind: "alias", value: ["Repo", "id"] },
          result: {
            kind: "function",
            fnName: "count",
            args: [{ kind: "alias", value: ["Repo", "issues", "id"] }],
          },
        },
        /**
         * Inside aggregate, Join Repo->issues
         */
        joins: [
          {
            kind: "inline",
            joinType: "left",
            joinOn: [
              ["Repo", "id"],
              ["Repo", "issues", "repo_id"],
            ],
            modelName: "Issue",
            target: "issues",
            namePath: ["Repo", "issues"],
          },
        ],
      },
    },
    /**
     * Aggregate query Org->repos->count(issues.repo.id)
     */
    {
      kind: "subquery",
      joinType: "inner",
      namePath: ["Org", "repos", "COUNT", "issues", "repo", "id"],
      joinOn: [
        ["Org", "repos", "id"],
        ["Org", "repos", "COUNT", "issues", "repo", "id", "__join_connection"],
      ],
      plan: {
        entry: "Repo",
        groupBy: [["Repo", "id"]],
        select: {
          __join_connection: { kind: "alias", value: ["Repo", "id"] },
          result: {
            kind: "function",
            fnName: "count",
            args: [{ kind: "alias", value: ["Repo", "issues", "repo", "id"] }],
          },
        },
        /**
         * Inside aggregate, Join Repo->issues
         */
        joins: [
          {
            kind: "inline",
            joinType: "left",
            joinOn: [
              ["Repo", "id"],
              ["Repo", "issues", "repo_id"],
            ],
            modelName: "Issue",
            target: "issues",
            namePath: ["Repo", "issues"],
          },
          /**
           * Inside aggregate, Join [Repo->]issues->repo
           */
          {
            kind: "inline",
            joinType: "left",
            joinOn: [
              ["Repo", "issues", "repo_id"],
              ["Repo", "issues", "repo", "id"],
            ],
            modelName: "Repo",
            target: "repo",
            namePath: ["Repo", "issues", "repo"],
          },
        ],
      },
    },
    /**
     * Aggregate query Org->repos->sum(issues.id)
     */
    {
      kind: "subquery",
      joinType: "inner",
      namePath: ["Org", "repos", "SUM", "Repo", "issues", "id"],
      joinOn: [
        ["Org", "repos", "id"],
        ["Org", "repos", "SUM", "Repo", "issues", "id", "__join_connection"],
      ],
      plan: {
        entry: "Repo",
        groupBy: [["Repo", "id"]],
        select: {
          __join_connection: { kind: "alias", value: ["Repo", "id"] },
          result: {
            kind: "function",
            fnName: "sum",
            args: [{ kind: "alias", value: ["Repo", "issues", "id"] }],
          },
        },
        /**
         * Inside aggregate, Join Repo->issues
         */
        joins: [
          {
            kind: "inline",
            joinType: "left",
            joinOn: [
              ["Repo", "id"],
              ["Repo", "issues", "repo_id"],
            ],
            modelName: "Issue",
            target: "issues",
            namePath: ["Repo", "issues"],
          },
        ],
      },
    },
    /**
     * Aggregate query Org->repos->count(issues.repo_name)
     */
    {
      kind: "subquery",
      joinType: "inner",
      namePath: ["Org", "repos", "COUNT", "issues", "repo", "name"],
      joinOn: [
        ["Org", "repos", "id"],
        ["Org", "repos", "COUNT", "issues", "repo", "name", "__join_connection"],
      ],
      plan: {
        entry: "Repo",
        groupBy: [["Repo", "id"]],
        select: {
          __join_connection: { kind: "alias", value: ["Repo", "id"] },
          result: {
            kind: "function",
            fnName: "count",
            args: [{ kind: "alias", value: ["Repo", "issues", "repo", "name"] }],
          },
        },
        /**
         * Inside aggregate, Join Repo->issues
         */
        joins: [
          {
            kind: "inline",
            joinType: "left",
            joinOn: [
              ["Repo", "id"],
              ["Repo", "issues", "repo_id"],
            ],
            modelName: "Issue",
            target: "issues",
            namePath: ["Repo", "issues"],
          },
          /**
           * Inside aggregate, Join [Repo->]issues->repo
           */
          {
            kind: "inline",
            joinType: "left",
            joinOn: [
              ["Repo", "issues", "repo_id"],
              ["Repo", "issues", "repo", "id"],
            ],
            modelName: "Repo",
            target: "repo",
            namePath: ["Repo", "issues", "repo"],
          },
        ],
      },
    },
    /**
     * Join Org->count(Org.repos.id)
     */
    {
      kind: "subquery",
      joinType: "left",
      namePath: ["Org", "COUNT", "repos", "id"],
      joinOn: [
        ["Org", "id"],
        ["Org", "COUNT", "repos", "id", "__join_connection"],
      ],
      plan: {
        /**
         * Aggregate query Org->repos
         */
        entry: "Org",
        groupBy: [["Org", "id"]],
        select: {
          __join_connection: { kind: "alias", value: ["Org", "id"] },
          result: {
            kind: "function",
            fnName: "count",
            args: [{ kind: "alias", value: ["Org", "repos", "id"] }],
          },
        },
        joins: [
          {
            kind: "inline",
            joinType: "left",
            joinOn: [
              ["Org", "id"],
              ["Org", "repos", "org_id"],
            ],
            modelName: "Repo",
            namePath: ["Org", "repos"],
            target: "repos",
          },
        ],
      },
    },
  ],
};

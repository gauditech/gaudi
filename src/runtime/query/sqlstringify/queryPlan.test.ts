import { format } from "sql-formatter";

import { QueryPlan } from "./queryPlan";
import { queryPlanToString } from "./stringify";

import { compileToOldSpec } from "@src/compiler";
import { compose } from "@src/composer/composer";
import { CustomManyEndpointDef, FetchOneAction, QueryDef } from "@src/types/definition";

/**
 * Define a query wrapper
 */

function makeTestQuery(models: string, query: string): QueryDef {
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
  return action.query;
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
      count(r.issues) // fixme it should work without '.id' as well
      + count(r.issues.repo.id) + sum(r.issues.id) > count(r.issues.repo_name) + r.ref_number
      + count(o.repos.id)
    },
    select { id, name, org_name }
  }
`;

    return makeTestQuery(modelBp, queryBp);
  }

  it("composes a query", () => {
    const query = setup();
    expect(query).toMatchSnapshot();
  });
  it("stringifies the query plan", () => {
    // const query = setup();
    const qstr = queryPlanToString(QP);
    const final = format(qstr, { language: "postgresql" });

    expect(final).toMatchInlineSnapshot(`
      "SELECT
        "Org.repos"."id" AS "id",
        "Org.repos"."name" AS "name",
        "Org.repos.org"."name" AS "org_name"
      FROM
        org AS "Org"
        JOIN repo AS "Org.repos" ON "Org"."id" = "Org.repos"."org_id"
        JOIN org AS "Org.repos.org" ON "Org.repos"."org_id" = "Org.repos.org"."id"
        JOIN (
          SELECT
            "Repo"."id" AS "__join_connection",
            count("Repo.issues"."id") AS "result"
          FROM
            repo AS "Repo"
            JOIN issue AS "Repo.issues" ON "Repo"."id" = "Repo.issues"."repo_id"
          GROUP BY
            "Repo"."id"
        ) AS "Org.repos.COUNT.issues.id" ON "Org.repos"."id" = "Org.repos.COUNT.issues.id"."__join_connection"
        JOIN (
          SELECT
            "Repo"."id" AS "__join_connection",
            count("Repo.issues.repo"."id") AS "result"
          FROM
            repo AS "Repo"
            JOIN issue AS "Repo.issues" ON "Repo"."id" = "Repo.issues"."repo_id"
            JOIN repo AS "Repo.issues.repo" ON "Repo.issues"."repo_id" = "Repo.issues.repo"."id"
          GROUP BY
            "Repo"."id"
        ) AS "Org.repos.COUNT.issues.repo.id" ON "Org.repos"."id" = "Org.repos.COUNT.issues.repo.id"."__join_connection"
        JOIN (
          SELECT
            "Repo"."id" AS "__join_connection",
            sum("Repo.issues"."id") AS "result"
          FROM
            repo AS "Repo"
            JOIN issue AS "Repo.issues" ON "Repo"."id" = "Repo.issues"."repo_id"
          GROUP BY
            "Repo"."id"
        ) AS "Org.repos.SUM.Repo.issues.id" ON "Org.repos"."id" = "Org.repos.SUM.Repo.issues.id"."__join_connection"
        JOIN (
          SELECT
            "Repo"."id" AS "__join_connection",
            count("Repo.issues.repo"."name") AS "result"
          FROM
            repo AS "Repo"
            JOIN issue AS "Repo.issues" ON "Repo"."id" = "Repo.issues"."repo_id"
            JOIN repo AS "Repo.issues.repo" ON "Repo.issues"."repo_id" = "Repo.issues.repo"."id"
          GROUP BY
            "Repo"."id"
        ) AS "Org.repos.COUNT.issues.repo.name" ON "Org.repos"."id" = "Org.repos.COUNT.issues.repo.name"."__join_connection"
        JOIN (
          SELECT
            "Org"."id" AS "__join_connection",
            count("Org.repos"."id") AS "result"
          FROM
            org AS "Org"
            JOIN repo AS "Org.repos" ON "Org"."id" = "Org.repos"."org_id"
          GROUP BY
            "Org"."id"
        ) AS "Org.COUNT.repos.id" ON "Org"."id" = "Org.COUNT.repos.id"."__join_connection"
      WHERE
        (
          "Org.repos.COUNT.issues.id"."result" + (
            "Org.repos.COUNT.issues.repo.id"."result" + "Org.repos.SUM.issues.id"."result"
          )
        ) > (
          "Org.repos.COUNT.issues.repo_name"."result" + (
            "Org.repos"."ref_number" + "Org.COUNT.repos.id"."result"
          )
        )"
    `);
  });
});

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

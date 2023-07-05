import { format } from "sql-formatter";

import { QueryAtom, QueryPlan, buildQueryPlan, collectQueryAtoms } from "./queryPlan";
import { queryPlanToString } from "./stringify";

import { makeTestQuery } from "@runtime/common/testUtils";

describe("Query plan", () => {
  it("works with complex aggregates", () => {
    const modelBp = `
    model Org {
      reference owner { to Owner }
      field name { type string }
      relation repos { from Repo, through org }

      computed total_issues { count(repos.issues.id) }
    }

    model Owner {
      field full_name { type string }
      relation orgs { from Org, through owner }
    }

    model Repo {
      reference org { to Org }
      field name { type string }
      field ref_number { type integer }
      relation issues { from Issue, through repo }

      computed org_name { org.name }
      computed org_total_issues { org.total_issues + 1 }
    }

    model Issue {
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
      select { id, name, org_name, owner_name: o.owner.full_name }
    }
  `;

    const { def, query } = makeTestQuery(modelBp, queryBp);
    expect(query).toMatchSnapshot("QueryDef snapshot");
    const atoms = collectQueryAtoms(def, query);
    expect(atoms).toEqual(ATOMS);
    const plan = buildQueryPlan(def, query);
    expect(plan).toEqual(QP);
    const qstr = queryPlanToString(QP);
    const final = format(qstr, { language: "postgresql" });

    expect(final).toMatchSnapshot("SQL snapshot");
  });

  it("supports subqueries using partition/over", () => {
    const modelBp = `
    model Org {
      relation repos { from Repo, through org }
      query latest_repos { from repos, order by { id desc }, limit 5 }
    }
    model Repo {
      field collectedPoints { type integer }
      reference org { to Org }
    }
    `;

    const queryBp = `
    query {
      from Org,
      filter { sum(latest_repos.collectedPoints) > 100 },
      select { id }
    }
    `;

    const { def, query } = makeTestQuery(modelBp, queryBp);
    const plan = buildQueryPlan(def, query);
    expect(plan).toMatchSnapshot("QueryPlan snapshot");
    const sql = queryPlanToString(plan);
    expect(sql).toMatchSnapshot("SQL snapshot");
  });

  it("supports 'in' array or subqueries", () => {
    const modelBp = `
    model Org {
      relation repos { from Repo, through org }
      query firstRepo { from repos, first }
    }
    model Repo {
      reference org { to Org }
    }
    `;

    const queryBp = `
    query {
      from Org as o,
      filter { 5+1 in o.repos.org.id or
        o.id + 1 in o.repos.org.id or o.id in [1, o.firstRepo.id, 2] },
      select { id }
    }
    `;

    const { def, query } = makeTestQuery(modelBp, queryBp);
    const plan = buildQueryPlan(def, query);
    expect(plan).toMatchSnapshot("QueryPlan snapshot");
    const sql = queryPlanToString(plan);
    expect(sql).toMatchSnapshot("SQL snapshot");
  });

  it("order by expression", () => {
    const modelBp = `
    model Org {
      relation repos { from Repo, through org }
    }
    model Repo {
      reference org { to Org }
    }
    `;

    const queryBp = `
    query {
      from Org,
      select { id },
      order by { count(repos.id) }
    }
    `;

    const { def, query } = makeTestQuery(modelBp, queryBp);
    const plan = buildQueryPlan(def, query);
    expect(plan).toMatchSnapshot("QueryPlan snapshot");
    const sql = queryPlanToString(plan);
    expect(sql).toMatchSnapshot("SQL snapshot");
  });
});

const ATOMS: QueryAtom[] = [
  { kind: "table-namespace", namePath: ["Org", "owner"] },
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
  fromPath: ["Org", "repos"],
  groupBy: [],
  limit: undefined,
  offset: undefined,
  orderBy: undefined,
  filter: {
    kind: "function",
    fnName: ">",
    args: [
      // count(r.issues) + count(r.issues.repo.id) + sum(r.issues.id)
      {
        kind: "function",
        fnName: "+",
        args: [
          // count(r.issues) + count(r.issues.repo.id)
          {
            kind: "function",
            fnName: "+",
            args: [
              // count(r.issues)
              {
                kind: "alias",
                value: ["Org", "repos", "COUNT", "issues", "id", "result"],
              },
              // count(r.issues.repo.id)
              {
                kind: "alias",
                value: ["Org", "repos", "COUNT", "issues", "repo", "id", "result"],
              },
            ],
          },
          // sum(r.issues.id)
          {
            kind: "alias",
            value: ["Org", "repos", "SUM", "issues", "id", "result"],
          },
        ],
      },
      // count(r.issues.repo_name) + r.ref_number + count(o.repos.id)
      {
        kind: "function",
        fnName: "+",
        args: [
          // count(r.issues.repo_name) + r.ref_number
          {
            kind: "function",
            fnName: "+",
            args: [
              // count(r.issues.repo_name)
              {
                kind: "alias",
                value: ["Org", "repos", "COUNT", "issues", "repo_name", "result"],
              },
              // r.ref_number
              {
                kind: "alias",
                value: ["Org", "repos", "ref_number"],
              },
            ],
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
  select: {
    id: { kind: "alias", value: ["Org", "repos", "id"] },
    name: { kind: "alias", value: ["Org", "repos", "name"] },
    org_name: { kind: "alias", value: ["Org", "repos", "org", "name"] },
    owner_name: { kind: "alias", value: ["Org", "owner", "full_name"] },
  },
  joins: [
    /**
     * Main query, join Org->owner
     */
    {
      kind: "inline",
      joinType: "inner",
      joinOn: [
        ["Org", "owner_id"],
        ["Org", "owner", "id"],
      ],
      modelName: "Owner",
      namePath: ["Org", "owner"],
      target: "owner",
    },
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
     * Aggregate query Org->count(repos.id)
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
        entry: "Org",
        fromPath: ["Org", "repos"],
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
          /**
           * Inside aggregate, Join Org->repos
           */
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
    /**
     * Aggregate query Org->repos->count(issues.id)
     */
    {
      kind: "subquery",
      joinType: "left",
      namePath: ["Org", "repos", "COUNT", "issues", "id"],
      joinOn: [
        ["Org", "repos", "id"],
        ["Org", "repos", "COUNT", "issues", "id", "__join_connection"],
      ],
      plan: {
        entry: "Repo",
        fromPath: ["Repo", "issues"],
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
      joinType: "left",
      namePath: ["Org", "repos", "COUNT", "issues", "repo", "id"],
      joinOn: [
        ["Org", "repos", "id"],
        ["Org", "repos", "COUNT", "issues", "repo", "id", "__join_connection"],
      ],
      plan: {
        entry: "Repo",
        fromPath: ["Repo", "issues", "repo"],
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
     * Aggregate query Org->repos->count(issues.repo_name)
     */
    {
      kind: "subquery",
      joinType: "left",
      namePath: ["Org", "repos", "COUNT", "issues", "repo_name"],
      joinOn: [
        ["Org", "repos", "id"],
        ["Org", "repos", "COUNT", "issues", "repo_name", "__join_connection"],
      ],
      plan: {
        entry: "Repo",
        fromPath: ["Repo", "issues"],
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
     * Aggregate query Org->repos->sum(issues.id)
     */
    {
      kind: "subquery",
      joinType: "left",
      namePath: ["Org", "repos", "SUM", "issues", "id"],
      joinOn: [
        ["Org", "repos", "id"],
        ["Org", "repos", "SUM", "issues", "id", "__join_connection"],
      ],
      plan: {
        entry: "Repo",
        fromPath: ["Repo", "issues"],
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
  ],
};

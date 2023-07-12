import _ from "lodash";

import { makeTestQuery } from "../common/testUtils";

import { buildQueryPlan } from "./queryPlan";
import { queryPlanToString } from "./stringify";

describe("Aggregates to queries", () => {
  it("composes a query with simple aggregate through relation", () => {
    const modelsBp = `
    model Org {
      field name { type string }
      relation repos { from Repo, through org }
      computed repo_count { count(repos.id) }
    }
    model Repo {
      reference org { to Org }
      field name { type string }
    }`;

    const queryBp = `
    query {
      from Org,
      select { id, name, repo_count }
    }`;

    const { def, query } = makeTestQuery(modelsBp, queryBp);

    const qp = buildQueryPlan(def, query);
    const sql = queryPlanToString(qp);
    expect(sql).toMatchSnapshot();
  });
  it("composes a query with simple aggregate through query", () => {
    const modelBp = `
    model Org {
      field name { type string }
      relation repos { from Repo, through org }
      query all_repos { from repos }
      query all_repos_nested { from all_repos }
      computed repo_count { count(all_repos_nested.id) }
    }
    model Repo {
      reference org { to Org }
      field name { type string }
    }`;

    const queryBp = `
    query {
      from Org,
      select { id, name, repo_count }
    }`;

    const { def, query } = makeTestQuery(modelBp, queryBp);
    const qp = buildQueryPlan(def, query);
    const sql = queryPlanToString(qp);
    expect(sql).toMatchSnapshot();
  });
  it("composes a query with simple aggregate that has joins in the aggregate subquery", () => {
    const modelBp = `
    model Org {
      field name { type string }
      relation repos { from Repo, through org }
      computed total_issues { count(repos.issues.id) }
    }
    model Repo {
      reference org { to Org }
      field name { type string }
      relation issues { from Issue, through repo }
    }
    model Issue {
      reference repo { to Repo }
      field name { type string }
    }`;

    const queryBp = `
    query {
      from Org,
      select { id, name, total_issues }
    }`;

    const { def, query } = makeTestQuery(modelBp, queryBp);
    const qp = buildQueryPlan(def, query);
    const sql = queryPlanToString(qp);
    expect(sql).toMatchSnapshot();
  });
  it("composes a query that filters by aggregate field to produce another aggregate", () => {
    const modelBp = `
    model Org {
      field name { type string }
      relation repos { from Repo, through org }
      query issues_with_comments { from repos.issues, filter { comment_count > 0 } }
      computed total_issues { count(issues_with_comments.id) }
    }
    model Repo {
      reference org { to Org }
      field name { type string }
      relation issues { from Issue, through repo }
    }
    model Issue {
      reference repo { to Repo }
      field name { type string }
      relation comments { from Comment, through issue }
      computed comment_count { count(comments.id) }
    }
    model Comment {
      reference issue { to Issue }
      field name { type string }
    }`;

    const queryBp = `
    query {
      from Org,
      select { id, name, total_issues }
    }`;

    const { def, query } = makeTestQuery(modelBp, queryBp);
    const qp = buildQueryPlan(def, query);
    const sql = queryPlanToString(qp);
    expect(sql).toMatchSnapshot();
  });
});

describe("Expressions to queries", () => {
  it("composes a complex filter expression and computed", () => {
    const modelBp = `
    model Item {
      field value { type integer }
      field multiplier { type integer }
      field textual { type string }
      computed worthiness {
        multiplier * (value + 1) / length(textual + "tail")
      }
    }`;

    const queryBp = `
    query {
      from Item,
      filter { multiplier * (value + 1) / length(textual + "tail") is worthiness }
    }`;

    const { def, query } = makeTestQuery(modelBp, queryBp);
    const qp = buildQueryPlan(def, query);
    const sql = queryPlanToString(qp);
    expect(sql).toMatchSnapshot();
  });
});

describe("Expression functions to queries", () => {
  it("composes a query with expression functions", () => {
    const modelBp = `
    model Repo {
      field name { type string }
    }`;

    const queryBp = `
    query {
      from Repo,
      filter {
        // test SQL functions
        length(name) is 4
        or name + name is "foofoo"
        or lower(name) is lower("FOO")
        or upper(name) is upper("BAR")
        or now() > 123456789
      }
    }`;

    const { def, query } = makeTestQuery(modelBp, queryBp);
    const qp = buildQueryPlan(def, query);
    const sql = queryPlanToString(qp);
    expect(sql).toMatchSnapshot();
  });
});

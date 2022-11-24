import _ from "lodash";

import { EndpointQueries, QueryTree, endpointQueries } from "./build";
import { queryToString } from "./stringify";

import { compile, compose, parse } from "@src/index";
import { QueryDef } from "@src/types/definition";

describe("Endpoint queries", () => {
  it("nested query", () => {
    const bp = `
    model Org {
      field slug { type text, unique }
      relation repos { from Repo, through org }
      query public_repos { from repos, filter { is_public is true }}
    }
    model Repo {
      reference org { to Org }
      field is_public { type boolean }
      field name { type text }
    }
    entrypoint Orgs {
      target model Org
      identify with slug
      entrypoint Repos {
        target relation public_repos
        response { id, name }

        get endpoint {}
      }
    }

    `;
    const def = compose(compile(parse(bp)));

    const endpoint = def.entrypoints[0].entrypoints[0].endpoints[0];
    const q = endpointQueries(def, endpoint);
    expect(q).toMatchSnapshot();
    expect(extractEndpointQueries(q)).toHaveLength(3);
    expect(extractEndpointQueries(q).map((q) => queryToString(def, q))).toMatchSnapshot();
  });
  it("chained nested query", () => {
    const bp = `
    model Org {
      field slug { type text, unique }
      relation repos { from Repo, through org }
      query public_repos { from repos, filter { is_public is true }}
      query public_issues { from public_repos.issues  }
    }
    model Repo {
      reference org { to Org }
      field is_public { type boolean }
      field name { type text }
      relation issues { from Issue, through repo }
    }
    model Issue {
      reference repo { to Repo }
      field name { type text }
    }
    entrypoint Orgs {
      target model Org
      identify with slug
      entrypoint RepoIssues {
        target relation public_issues
        response { id, name, repo { org, name, is_public } }
        get endpoint {}
      }
    }

    `;
    const def = compose(compile(parse(bp)));
    const endpoint = def.entrypoints[0].entrypoints[0].endpoints[0];
    const q = endpointQueries(def, endpoint);
    expect(q).toMatchSnapshot();
    expect(extractEndpointQueries(q)).toHaveLength(5);
    expect(extractEndpointQueries(q).map((q) => queryToString(def, q))).toMatchSnapshot();
    q;
  });
});

function extractEndpointQueries(q: EndpointQueries): QueryDef[] {
  const allTrees = [...q.parentContextQueryTrees, q.targetQueryTree, q.responseQueryTree];
  return allTrees.flatMap(extractQueryTree);
}

function extractQueryTree(qt: QueryTree): QueryDef[] {
  return [qt.query, ...qt.related.flatMap(extractQueryTree)];
}

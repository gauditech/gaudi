import _ from "lodash";

import { QueryTree, queryTreeFromParts } from "./build";
import { EndpointQueries, buildEndpointQueries } from "./endpointQueries";
import { queryToString } from "./stringify";

import { compile, compose, parse } from "@src/index";
import { EndpointDef, QueryDef } from "@src/types/definition";

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
    const q = buildEndpointQueries(def, endpoint);
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
    const q = buildEndpointQueries(def, endpoint);
    expect(q).toMatchSnapshot();
    expect(extractEndpointQueries(q)).toHaveLength(5);
    expect(
      extractEndpointQueries(q).map((q) => queryToString(def, q) + "\n\n\n")
    ).toMatchSnapshot();
    q;
  });

  describe("Deeply nested entrypoints", () => {
    const bp = `
    model Org {
      field name { type text }
      field slug { type text, unique }
      relation repos { from Repo, through org }
    }


    model Repo {
      reference org { to Org }
      field name { type text }
      field slug { type text, unique }
      relation issues { from Issue, through repo }
    }

    model Issue {
      reference repo { to Repo }
      field name { type text }
      field description { type text }
    }

    // ----- entrypoints

    entrypoint Orgs {
      target model Org
      identify with slug
      response { name, slug }

      get endpoint {}
      list endpoint {}
      create endpoint {}
      update endpoint {}
      delete endpoint {}

      entrypoint Repos {
        target relation repos
        response { id, slug, org_id }

        get endpoint {}
        list endpoint {}
        create endpoint {}
        update endpoint {}
        delete endpoint {}

        entrypoint Issues {
          target relation issues
          response { id, name, repo_id }

          get endpoint {}
          list endpoint {}
          create endpoint {}
          update endpoint {}
          delete endpoint {}
        }
      }
    }
    `;
    const def = compose(compile(parse(bp)));
    const entrypoint = def.entrypoints[0].entrypoints[0].entrypoints[0];
    const range = entrypoint.endpoints.map((ep) => [ep.kind, ep] as [string, EndpointDef]);
    it.each(range)("test %s endpoint", (_kind, endpoint) => {
      const q = buildEndpointQueries(def, endpoint);
      expect(extractEndpointQueries(q)).toMatchSnapshot();
      expect(
        extractEndpointQueries(q).map((q) => queryToString(def, q) + "\n\n\n")
      ).toMatchSnapshot();
      expect(endpoint.target).toMatchSnapshot();
      expect(endpoint.parentContext).toMatchSnapshot();
    });
  });
});

describe("Orderby, limit and offset", () => {
  it("supports orderby, limit and offset in non-batching query", () => {
    const bp = `
    model Org {
      relation repos { from Repo, through org }
      query recent_repos {
        from repos
        order by id desc
        limit 10, offset 5
      }
    }
    model Repo {
      reference org { to Org }
    }
    `;
    const def = compose(compile(parse(bp)));
    const q = def.models[0].queries[0];

    expect(queryToString(def, q)).toMatchSnapshot();
  });
  it("supports orderby, limit and offset in batching query", () => {
    const bp = `
    model Org {
      relation repos { from Repo, through org }
      query recent_repos {
        from repos
        order by id desc
        limit 10, offset 5
      }
    }
    model Repo {
      reference org { to Org }
    }
    `;
    const def = compose(compile(parse(bp)));
    const qt = queryTreeFromParts(def, "test", ["Org"], undefined, [
      {
        kind: "query",
        alias: "recent_repos",
        name: "recent_repos",
        namePath: ["Org", "recent_repos"],
        select: [
          {
            kind: "field",
            alias: "id",
            name: "id",
            namePath: ["Org", "recent_repos", "id"],
            refKey: "Repo.id",
          },
        ],
      },
    ]);
    expect(extractQueryTree(qt)).toMatchSnapshot();
    expect(
      extractQueryTree(qt)
        .map((q) => queryToString(def, q))
        .join("\n\n\n")
    ).toMatchSnapshot();
  });
});

function extractEndpointQueries(q: EndpointQueries): QueryDef[] {
  const allTrees = [...q.parentContextQueryTrees, q.targetQueryTree, q.responseQueryTree];
  return allTrees.flatMap(extractQueryTree);
}

function extractQueryTree(qt: QueryTree): QueryDef[] {
  return [qt.query, ...qt.related.flatMap(extractQueryTree)];
}

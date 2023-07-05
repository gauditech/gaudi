import { QueryTree, queryTreeFromParts } from "./build";
import {
  EndpointQueries,
  buildEndpointQueries,
  decorateWithFilter,
  decorateWithOrderBy,
  decorateWithPaging,
} from "./endpointQueries";
import { buildQueryPlan } from "./queryPlan";
import { queryPlanToString } from "./stringify";

import { compileFromString } from "@runtime/common/testUtils";
import { EndpointDef, ListEndpointDef, QueryDef } from "@gaudi/compiler/types/definition";

describe("Endpoint queries", () => {
  describe("Deeply nested entrypoints", () => {
    const bp = `
    model Org {
      field name { type string }
      field slug { type string, unique }
      relation repos { from Repo, through org }
    }


    model Repo {
      reference org { to Org }
      field name { type string }
      field slug { type string, unique }
      relation issues { from Issue, through repo }
    }

    model Issue {
      reference repo { to Repo }
      field name { type string }
      field description { type string }
    }

    // ----- entrypoints

    api {
      entrypoint Org {
        identify { through slug }
        response { name, slug }

        get endpoint {}
        list endpoint {}
        create endpoint {}
        update endpoint {}
        delete endpoint {}

        entrypoint repos {
          response { id, slug, org_id }

          get endpoint {}
          list endpoint {}
          create endpoint {}
          update endpoint {}
          delete endpoint {}

          entrypoint issues {
            response { id, name, repo_id }

            get endpoint {}
            list endpoint {}
            create endpoint {}
            update endpoint {}
            delete endpoint {}
          }
        }
      }
    }
    `;
    const def = compileFromString(bp);
    const entrypoint = def.apis[0].entrypoints[0].entrypoints[0].entrypoints[0];
    const range = entrypoint.endpoints.map((ep) => [ep.kind, ep] as [string, EndpointDef]);
    it.each(range)("test %s endpoint", (_kind, endpoint) => {
      const q = buildEndpointQueries(def, endpoint);
      expect(extractEndpointQueries(q)).toMatchSnapshot();
      expect(
        extractEndpointQueries(q).map((q) => queryPlanToString(buildQueryPlan(def, q)) + "\n\n\n")
      ).toMatchSnapshot();
      expect(endpoint.target).toMatchSnapshot();
      expect(endpoint.parentContext).toMatchSnapshot();
    });
  });

  describe("List endpoint response queries", () => {
    /** Function that builds query for specific options combo. */
    function buildBp(options?: { paging?: boolean; orderBy?: boolean; filter?: boolean }) {
      const bp = `
      model Item {
        field name { type string }
      }

      api {
        entrypoint Item {
          list endpoint {
            ${options?.paging ? "pageable" : ""}
            ${options?.orderBy ? "order by { name desc }" : ""}
            ${options?.filter ? 'filter { name is "asdf" }' : ""}
          }
        }
      }
    `;

      const def = compileFromString(bp);
      const ep = def.apis[0].entrypoints[0].endpoints[0] as ListEndpointDef;
      let qt = buildEndpointQueries(def, ep).responseQueryTree;

      if (options?.paging) {
        qt = decorateWithPaging(ep, qt, { page: 2, pageSize: 10 });
      }
      if (options?.orderBy) {
        qt = decorateWithOrderBy(ep, qt);
      }
      if (options?.filter) {
        qt = decorateWithFilter(ep, qt);
      }

      return { qt, def };
    }

    // build plain separately so we can use it's def in assertions
    const plainBp = buildBp();

    // build possible query combos
    const queries = {
      plain: plainBp.qt,
      paging: buildBp({ paging: true }).qt,
      orderBy: buildBp({ orderBy: true }).qt,
      "paging/order/filter": buildBp({ paging: true, orderBy: true, filter: true }).qt,
    };

    it.each(Object.entries(queries))("test %s query endpoint", (_name, q) => {
      expect(extractQueryTree(q)).toMatchSnapshot();
      expect(
        extractQueryTree(q).map((q) => queryPlanToString(buildQueryPlan(plainBp.def, q)) + "\n\n\n")
      ).toMatchSnapshot();
    });
  });

  describe("List nested endpoint response queries", () => {
    /** Function that builds query for specific options combo. */
    function buildBp(options?: { paging?: boolean; orderBy?: boolean; filter?: boolean }) {
      const bp = `
      model Item1 {
        field name { type string }
        relation item2 { from Item2, through item1 }
      }
      model Item2 {
        reference item1 { to Item1 }
        field name { type string }
      }

      api {
        entrypoint Item1 {

          entrypoint item2 {
            list endpoint {
              ${options?.paging ? "pageable" : ""}
              ${options?.orderBy ? "order by { name desc }" : ""}
              ${options?.filter ? 'filter { name is "asdf" }' : ""}
            }
          }
        }
      }
    `;

      const def = compileFromString(bp);
      const ep = def.apis[0].entrypoints[0].entrypoints[0].endpoints[0] as ListEndpointDef;
      let qt = buildEndpointQueries(def, ep).responseQueryTree;

      if (options?.paging) {
        qt = decorateWithPaging(ep, qt, { page: 2, pageSize: 10 });
      }
      if (options?.orderBy) {
        qt = decorateWithOrderBy(ep, qt);
      }
      if (options?.filter) {
        qt = decorateWithFilter(ep, qt);
      }

      return { qt, def };
    }

    // build plain separately so we can use it's def in assertions
    const plainBp = buildBp();

    // build possible query combos
    const queries = {
      plain: plainBp.qt,
      paging: buildBp({ paging: true }).qt,
      orderBy: buildBp({ orderBy: true }).qt,
      "paging/order/filter": buildBp({ paging: true, orderBy: true, filter: true }).qt,
    };

    it.each(Object.entries(queries))("test %s query endpoint", (_name, q) => {
      expect(extractQueryTree(q)).toMatchSnapshot();
      expect(
        extractQueryTree(q).map((q) => queryPlanToString(buildQueryPlan(plainBp.def, q)) + "\n\n\n")
      ).toMatchSnapshot();
    });
  });
});

describe("Orderby, limit and offset", () => {
  it("supports orderby, limit and offset in non-batching query", () => {
    const bp = `
    model Org {
      relation repos { from Repo, through org }
      query recent_repos {
        from repos,
        order by { id desc },
        limit 10, offset 5
      }
    }
    model Repo {
      reference org { to Org }
    }
    `;
    const def = compileFromString(bp);
    const q = def.models[0].queries[0];

    expect(queryPlanToString(buildQueryPlan(def, q))).toMatchSnapshot();
  });
  it("supports orderby, limit and offset in batching query", () => {
    const bp = `
    model Org {
      relation repos { from Repo, through org }
      query recent_repos {
        from repos,
        order by { id desc },
        limit 10, offset 5
      }
    }
    model Repo {
      reference org { to Org }
    }
    `;
    const def = compileFromString(bp);
    const qt = queryTreeFromParts(def, "test", ["Org"], undefined, [
      {
        kind: "nested-select",
        refKey: "Org.recent_repos",
        alias: "recent_repos",
        namePath: ["Org", "recent_repos"],
        select: [
          {
            kind: "expression",
            alias: "id",
            expr: {
              kind: "alias",
              namePath: ["Org", "recent_repos", "id"],
            },
            type: { kind: "integer", nullable: false },
          },
        ],
      },
    ]);
    expect(extractQueryTree(qt)).toMatchSnapshot();
    expect(
      extractQueryTree(qt)
        .map((q) => queryPlanToString(buildQueryPlan(def, q)))
        .join("\n\n\n")
    ).toMatchSnapshot();
  });
});

describe("Query aliases", () => {
  const bp = `
  model Org {
    relation repos { from Repo, through org }
    query issues {
      from repos.issues as r.i,
      filter { r.is_public is true }
    }
  }
  model Repo {
    reference org { to Org }
    field is_public { type boolean }
    relation issues { from Issue, through repo }
  }
  model Issue {
    reference repo { to Repo }
  }
  `;
  const def = compileFromString(bp);
  const q = def.models[0].queries[0];
  expect(q).toMatchSnapshot();
});

function extractEndpointQueries(q: EndpointQueries): QueryDef[] {
  const allTrees = [...q.parentContextQueryTrees, q.targetQueryTree, q.responseQueryTree];
  return allTrees.flatMap(extractQueryTree);
}

function extractQueryTree(qt: QueryTree): QueryDef[] {
  return [qt.query, ...qt.related.flatMap(extractQueryTree)];
}

import _ from "lodash";

import { endpointQueries } from "./buildQuery";
import { queryToString } from "./queryStr";

import { compile, compose, parse } from "@src/index";

describe("queryStr", () => {
  it("context query", () => {
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
    expect({
      contextSQL: q.context ? queryToString(def, q.context) : null,
      targetSQL: queryToString(def, q.target),
    }).toMatchSnapshot();
  });
  it("target query", () => {
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
      relation issues { from Issue, through repo }
    }
    model Issue {
      reference repo { to Repo }
      field name { type text }
    }
    entrypoint Orgs {
      target model Org
      identify with slug
      entrypoint Repos {
        target relation public_repos
        response { id, name }

        entrypoint Issues {
          target relation issues
          list endpoint {}
        }
      }
    }

    `;
    const def = compose(compile(parse(bp)));
    const endpoint = def.entrypoints[0].entrypoints[0].entrypoints[0].endpoints[0];
    const q = endpointQueries(def, endpoint);
    expect({
      contextSQL: q.context ? queryToString(def, q.context) : null,
      targetSQL: queryToString(def, q.target),
    }).toMatchSnapshot();
  });
});

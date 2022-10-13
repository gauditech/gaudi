import _ from "lodash";

import { compile, compose, parse } from "../index";

import { queriableToString, queryableFromEndpointTargets } from "./query";

describe("queriables", () => {
  it("works 1", () => {
    const bp = `
    model Org {
      field slug { type text, unique }
      relation repos { from Repo, through org }
    }
    model Repo {
      reference org { to Org }
      field name { type text }
    }
    entrypoint Orgs {
      target model Org
      identify with slug
      entrypoint Repos {
        target relation repos
        response { id, name }

        get endpoint {}
      }
    }

    `;
    const def = compose(compile(parse(bp)));
    const q = queryableFromEndpointTargets(def, def.entrypoints[0].entrypoints[0].endpoints[0]);
    const s = queriableToString(def, q);
    console.log(s);
  });
});

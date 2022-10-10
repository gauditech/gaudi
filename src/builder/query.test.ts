import _ from "lodash";

import { compile, compose, parse } from "../index";

import { flattenEntrypoints, queriableEntrypoints, queriableToString } from "./query";

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
      }
    }

    `;
    const def = compose(compile(parse(bp)));
    const eps = flattenEntrypoints(def.entrypoints[0]);
    expect(eps).toHaveLength(2);
    const q = queriableEntrypoints(def, _.zip(eps, ["myorg", 4]) as any);
    const s = queriableToString(def, q);
    console.log(s);
  });
});

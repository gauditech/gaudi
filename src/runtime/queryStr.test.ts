import _ from "lodash";

import { compile, compose, parse } from "../index";

import { mkContextQuery, mkTargetQuery } from "./query";
import { queryToString } from "./queryStr";

import { SelectConstantItem } from "@src/types/definition";

describe("queryables", () => {
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
    const constant: SelectConstantItem = {
      kind: "constant",
      type: "integer",
      value: 1,
      alias: "exists",
    };
    const endpoint = def.entrypoints[0].entrypoints[0].endpoints[0];
    const q = mkContextQuery(def, endpoint.targets, [
      constant,
      { kind: "field", alias: "id", name: "id", namePath: ["Org", "id"], refKey: "Org.id" },
      {
        kind: "field",
        alias: "name",
        name: "name",
        namePath: ["Org", "public_repos", "name"],
        refKey: "Repo.name",
      },
    ]);
    const s = q ? queryToString(def, q) : "not queryable";
    console.log(s);
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
    const q = mkTargetQuery(def, endpoint);
    // console.log(q);
    const s = queryToString(def, q);
    console.log(s);
  });
});

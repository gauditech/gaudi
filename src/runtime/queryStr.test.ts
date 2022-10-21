import _ from "lodash";

import { compile, compose, parse } from "../index";

import { mkContextQuery } from "./query";
import { queryToString } from "./queryStr";

import { SelectConstantItem } from "@src/types/definition";

describe("queryables", () => {
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
    ]);
    const s = q ? queryToString(def, q) : "not queryable";
    console.log(s);
  });
});

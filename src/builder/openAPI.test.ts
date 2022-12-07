import { buildOpenAPI } from "./openAPI";

import { compile, compose, parse } from "@src/index";

describe("openAPI", () => {
  it("build spec", () => {
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

      get endpoint {}
      list endpoint {}
      create endpoint {}
      update endpoint {}
      delete endpoint {}

      entrypoint Repos {
        target relation repos
        response { id, name }

        get endpoint {}
        list endpoint {}
        create endpoint {}
        update endpoint {}
        delete endpoint {}
      }
    }
    `;

    const def = compose(compile(parse(bp)));

    expect(buildOpenAPI(def, "/api-test")).toMatchSnapshot();
  });
});

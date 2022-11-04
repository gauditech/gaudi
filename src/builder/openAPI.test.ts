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

      list endpoint {}
      get endpoint {}
      create endpoint {}

      entrypoint Repos {
        target relation repos
        response { id, name }

        get endpoint {}
        create endpoint {}
      }
    }
    `;

    const def = compose(compile(parse(bp)));

    expect(buildOpenAPI(def)).toMatchSnapshot();
  });
});

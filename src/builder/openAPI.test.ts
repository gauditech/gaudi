import { buildOpenAPI } from "./openAPI.js";

import { compileToOldSpec, compose } from "@src/index.js";

describe("openAPI", () => {
  it("build spec", () => {
    const bp = `
    model Org {
      field slug { type string, unique }
      relation repos { from Repo, through org }
    }
    model Repo {
      reference org { to Org }
      field name { type string }
    }
    entrypoint Org {
      identify { through slug }

      get endpoint {}
      list endpoint { pageable }
      create endpoint {}
      update endpoint {}
      delete endpoint {}

      entrypoint repos {
        response { id, name }

        get endpoint {}
        list endpoint { pageable }
        create endpoint {}
        update endpoint {}
        delete endpoint {}
      }
    }
    `;

    const def = compose(compileToOldSpec(bp));

    expect(buildOpenAPI(def, "/api-test")).toMatchSnapshot();
  });
});

import { buildOpenAPI } from "./openAPI";

import { compileBlueprint, compose } from "@src/index";

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
    api Test {
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
    }
    `;

    const def = compose(compileBlueprint(bp));

    expect(buildOpenAPI(def)).toMatchSnapshot();
  });
});

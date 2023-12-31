import { buildOpenAPI } from "./openAPI";

import { compileFromString } from "@compiler/common/testUtils";

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

    model AuthUser {}

    auth { model AuthUser }

    api Test {
      entrypoint Org as org {
        identify { through slug }

        get endpoint {
          authorize { @auth.id is not null }
        }
        list endpoint { pageable }
        create endpoint {}
        update endpoint {
          authorize { org.id > 4 }
        }
        delete endpoint {
          authorize { org.id > 4 and @auth.id is not null }
        }

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

    const def = compileFromString(bp);

    expect(buildOpenAPI(def)).toMatchSnapshot();
  });
});

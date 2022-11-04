import { compile, compose, parse } from "@src/index";
import { CreateEndpointDef } from "@src/types/definition";

describe("entrypoint", () => {
  it("composes basic example", () => {
    // Orgs assumes default response
    // Orgs.Repositories assumes default identifyWith; nested org select assuming all fields since not given
    const bp = `
    model Org {
      field slug { type text, unique }
      field name { type text }
      relation repos { from Repo, through org }
    }
    model Repo {
      reference org { to Org }
      field title { type text }
    }

    entrypoint Orgs {
      target model Org
      identify with slug
    
      list endpoint {}
      get endpoint {}
    
      entrypoint Repositories {
        target relation repos as repo
        response { id, org }

        list endpoint {}
        get endpoint {}
        create endpoint {}
      }
    }
    `;
    const def = compose(compile(parse(bp)));
    expect(def.entrypoints).toMatchSnapshot();
  });
  it("adds validators into fieldsets", () => {
    const bp = `
    model Org {
      field name { type text, validate { min 4, max 100 } }
    }

    entrypoint Orgs {
      target model Org
      create endpoint {}
    }
    `;
    const def = compose(compile(parse(bp)));
    const endpoint = def.entrypoints[0].endpoints[0] as CreateEndpointDef;
    expect(endpoint.fieldset).toMatchSnapshot();
  });
});

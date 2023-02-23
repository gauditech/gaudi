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

        custom endpoint {
          cardinality one
          method PATCH
          path "somePath"

          action {
            update {}
          }
        }
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
  it("collects dependencies", () => {
    const bp = `
    model Org {
      field name { type text }
      field desc { type text }

      relation repos { from Repo, through org }
    }
    model Repo {
      reference org { to Org }

      field name { type text }

      relation issues { from Issue, through repo}
    }
    model Issue {
      reference repo { to Repo }

      field source { type text }
      field orgDesc { type text }
    }

    entrypoint O {
      target model Org as org
      entrypoint R {
        target relation repos as repo
        create endpoint {
          action {
            create {}
            create repo.issues as i {
              set source concat(org.name, repo.name)
              set orgDesc org.desc
            }
          }
        }
      }
    }
    `;

    const def = compose(compile(parse(bp)));
    const endpoint = def.entrypoints[0].entrypoints[0].endpoints[0] as CreateEndpointDef;
    const orgSelect = endpoint.parentContext[0].select.map((s) => s.alias);
    const repoSelect = endpoint.target.select.map((s) => s.alias);
    const actionSelects = endpoint.actions.map((a) =>
      ("select" in a ? a.select : null)?.map((a) => a && a.alias)
    );
    expect({ orgSelect, repoSelect, actionSelects }).toMatchSnapshot();
  });
});

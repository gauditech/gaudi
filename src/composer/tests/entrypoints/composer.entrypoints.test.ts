import { compileToOldSpec, compose } from "@src/index";
import { CreateEndpointDef } from "@src/types/definition";

describe("entrypoint", () => {
  it("composes basic example", () => {
    // Orgs assumes default response
    // Orgs.Repositories assumes default identifyWith; nested org select assuming all fields since not given
    const bp = `
    model Org {
      field slug { type string, unique }
      field name { type string }
      relation repos { from Repo, through org }
    }
    model Repo {
      reference org { to Org }
      field title { type string }
    }

    entrypoint Orgs {
      target Org
      identify with slug

      list endpoint {}
      get endpoint {}

      entrypoint Repositories {
        target repos as repo
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
    const def = compose(compileToOldSpec(bp));
    expect(def.entrypoints).toMatchSnapshot();
  });
  it("adds validators into fieldsets", () => {
    const bp = `
    model Org {
      field name { type string, validate { min 4, max 100 } }
    }

    entrypoint Orgs {
      target Org
      create endpoint {}
    }
    `;
    const def = compose(compileToOldSpec(bp));
    const endpoint = def.entrypoints[0].endpoints[0] as CreateEndpointDef;
    expect(endpoint.fieldset).toMatchSnapshot();
  });
  it("collects dependencies", () => {
    const bp = `
    model Org {
      field name { type string }
      field desc { type string }

      relation repos { from Repo, through org }

      query repoCount { from repos, count }
      computed coef { 2 }
    }
    model Repo {
      reference org { to Org }

      field name { type string }

      relation issues { from Issue, through repo}
    }
    model Issue {
      reference repo { to Repo }

      field source { type string }
      field orgDesc { type string }
      field orgCoef { type integer }
    }

    entrypoint O {
      target Org as org
      entrypoint R {
        target repos as repo
        create endpoint {
          action {
            create {}
            create repo.issues as i {
              set source concat(org.name, repo.name)
              set orgDesc org.desc
              set orgCoef org.repoCount * org.coef
            }
          }
        }
      }
    }
    `;

    const def = compose(compileToOldSpec(bp));
    const endpoint = def.entrypoints[0].entrypoints[0].endpoints[0] as CreateEndpointDef;
    const orgSelect = endpoint.parentContext[0].select.map((s) => s.alias);
    const repoSelect = endpoint.target.select.map((s) => s.alias);
    const actionSelects = endpoint.actions.map((a) =>
      ("select" in a ? a.select : null)?.map((a) => a && a.alias)
    );
    expect({ orgSelect, repoSelect, actionSelects }).toMatchSnapshot();
  });
});

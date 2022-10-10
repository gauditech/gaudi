import { compile, compose, parse } from "@src/index";

describe("entrypoint", () => {
  it("composes basic example", () => {
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
      response { id, name, slug }
    
      list endpoint {}
      get endpoint {}
    
      entrypoint Repositories {
        target relation repos as repo

        list endpoint {}
        get endpoint {}
        create endpoint {}
      }
    }
    `;
    const def = compose(compile(parse(bp)));
    expect(def.entrypoints).toMatchSnapshot();
  });
});

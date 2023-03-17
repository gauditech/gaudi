import { compileToOldSpec, compose } from "@src/index";

describe("compose model queries", () => {
  it("nested example without filters", () => {
    const bp = `
    model Org {
      relation repos { from Repo, through org }
      query back_to_org { from repos.org }
    }
    model Repo {
      reference org { to Org }
    }
    `;
    const def = compose(compileToOldSpec(bp));
    expect(def.models[0].queries).toMatchSnapshot();
  });
  it("example with nested filters", () => {
    const bp = `
    model Org {
      relation repos { from Repo, through org }
      query repos_if_one { from repos, filter { org.id is 1 and is_active } }
    }
    model Repo {
      field is_active { type boolean }
      reference org { to Org }
    }
    `;
    const def = compose(compileToOldSpec(bp));

    expect(def.models[0].queries).toMatchSnapshot();
  });

  it("order and limit", () => {
    const bp = `
    model Org {
      relation repos { from Repo, through org }
      query recent_repos {
        from repos,
        order by { id desc },
        limit 5
      }
    }
    model Repo {
      reference org { to Org }
    }
    `;
    const def = compose(compileToOldSpec(bp));
    expect(def.models[0].queries[0]).toMatchSnapshot();
  });
});

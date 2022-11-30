import { compile, compose, parse } from "@src/index";

describe("populator", () => {
  it("succeeds for simple populator", () => {
    const bp = `
    model Org {
      field is_new { type boolean }
      field name { type text }
    }

    populator DevData {
      populate Orgs {
        target model Org as org

        set is_new true
        set name "test name"
      }
    }`;

    const def = compose(compile(parse(bp)));
    const populator = def.populators[0];

    expect(populator).toMatchSnapshot();
  });

  it("succeeds for nested populators", () => {
    const bp = `
    model Org {
      field is_new { type boolean }
      field name { type text }

      relation repos { from Repo, through org }
      relation issues { from Issue, through org }
    }

    model Repo {
      field name { type text }

      reference org { to Org }
      relation issues { from Issue, through repo }
    }

    model Issue {
      field title { type text }

      reference repo { to Repo }
      reference org { to Org }
    }

    populator DevData {
      populate Orgs {
        target model Org as org

        set is_new true
        set name "test name"

        populate Repos {
          target relation repos as repo
  
          set name "test name"

          populate Issues {
            target relation issues as issue

            set title "test title"
          }
        }
      }
    }`;

    const def = compose(compile(parse(bp)));
    const populator = def.populators[0];

    expect(populator).toMatchSnapshot();
  });

  it("succeeds for fixed iteration", () => {
    const bp = `
    model Org {
      field is_new { type boolean }
      field name { type text }
    }

    populator DevData {
      populate Orgs {
        target model Org as org

        repeat 5

        set is_new true
        set name "test name"
      }
    }`;

    const def = compose(compile(parse(bp)));
    const populator = def.populators[0];

    expect(populator).toMatchSnapshot();
  });

  it("succeeds for range iteration", () => {
    const bp = `
    model Org {
      field is_new { type boolean }
      field name { type text }
    }

    populator DevData {
      populate Orgs {
        target model Org as org

        repeat { min 1, max 3 }

        set is_new true
        set name "test name"
      }
    }`;

    const def = compose(compile(parse(bp)));
    const populator = def.populators[0];

    expect(populator).toMatchSnapshot();
  });

  it("succeeds for range iteration (only max)", () => {
    const bp = `
    model Org {
      field is_new { type boolean }
      field name { type text }
    }

    populator DevData {
      populate Orgs {
        target model Org as org

        repeat { max 3 }

        set is_new true
        set name "test name"
      }
    }`;

    const def = compose(compile(parse(bp)));
    const populator = def.populators[0];

    expect(populator).toMatchSnapshot();
  });

  it("succeeds for nested iterations", () => {
    const bp = `
    model Org {
      field is_new { type boolean }
      field name { type text }

      relation repos { from Repo, through org }
    }

    model Repo {
      field name { type text }

      reference org { to Org }
    }

    populator DevData {
      populate Orgs {
        target model Org as org

        repeat 4

        set is_new true
        set name "test name"

        populate repos {
          target relation repos as repo

          repeat { min 20, max 2000 }
          
          set name "test name"
        }
      }
    }`;

    const def = compose(compile(parse(bp)));
    const populator = def.populators[0];

    expect(populator).toMatchSnapshot();
  });
});

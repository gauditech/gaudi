import { compile, compose, parse } from "@src/index";

describe("populator composer", () => {
  it("succeeds for simple populator", () => {
    const bp = `
    model Org {
      field is_new { type boolean }
      field name { type text }
      field description { type text }
    }

    populator DevData {
      populate Orgs {
        target model Org as org

        set is_new true // boolean literal setter
        set name "test name" // string literal setter
        set description hook { // hook setter
          arg name name // (translates to) changeset reference setter
          inline \`"Description of" + name\`
        }
      }
    }`;

    const def = compose(compile(parse(bp)));
    const populator = def.populators[0];

    expect(populator).toMatchSnapshot();
  });

  it("succeeds for nested populators", () => {
    const bp = `
    model Org {
      field name { type text }

      relation repos { from Repo, through org }
    }

    model Repo {
      field name { type text }

      reference org { to Org }
      relation issues { from Issue, through repo }
    }

    model Issue {
      field title { type text }

      reference repo { to Repo }
    }

    populator DevData {
      populate Orgs {
        target model Org as org

        set name "test name"

        populate Repos {
          target relation repos as repo
  
          set name org.name // nested reference

          populate Issues {
            target relation issues as issue

            set title repo.name // nested reference
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

  it("fails when missing field setter", () => {
    const bp = `
    model Org {
      field name { type text }
      field description { type text }
      field active { type boolean }
    }

    populator DevData {
      populate Orgs {
        target model Org as org

        set name "test name"
        // missing field setters for "description" and "active" fields
      }
    }`;

    expect(() => compose(compile(parse(bp)))).toThrowErrorMatchingInlineSnapshot(
      `"Action create-one "org" is missing setters for fields: description,active"`
    );
  });
});

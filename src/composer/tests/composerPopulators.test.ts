import { compileToOldSpec, compose } from "@src/index.js";

describe("populator composer", () => {
  it("succeeds for simple populator", () => {
    const bp = `
    runtime MyRuntime {
      source path "./some/path"
    }

    model Org {
      field slug { type string }
      field name { type string }
      field description { type string }
    }

    populator DevData {
      populate Org as org {
        set slug "custom-org" // literal setter
        set name "test name " + slug // arithmetics setter
        set description hook { // hook setter
          arg name name // (translates to) changeset reference setter
          inline "'Description of' + name"
        }
      }
    }`;

    const def = compose(compileToOldSpec(bp));
    const populator = def.populators[0];

    expect(populator).toMatchSnapshot();
  });

  it("succeeds for nested populators", () => {
    const bp = `
    model Org {
      field name { type string }

      relation repos { from Repo, through org }
    }

    model Repo {
      field name { type string }

      reference org { to Org }
      relation issues { from Issue, through repo }
    }

    model Issue {
      field title { type string }

      reference repo { to Repo }
    }

    populator DevData {
      populate Org as org {
        set name "test name"

        populate repos as repo {
          set name org.name // nested reference

          populate issues as issue {
            set title repo.name // nested reference
          }
        }
      }
    }`;

    const def = compose(compileToOldSpec(bp));
    const populator = def.populators[0];

    expect(populator).toMatchSnapshot();
  });

  it("succeeds for fixed iteration", () => {
    const bp = `
    model Org {
      field is_new { type boolean }
      field name { type string }
    }

    populator DevData {
      populate Org as org {
        repeat 5

        set is_new true
        set name "test name"
      }
    }`;

    const def = compose(compileToOldSpec(bp));
    const populator = def.populators[0];

    expect(populator).toMatchSnapshot();
  });

  it("succeeds for range iteration", () => {
    const bp = `
    model Org {
      field is_new { type boolean }
      field name { type string }
    }

    populator DevData {
      populate Org as org {
        repeat { start 1, end 3 }

        set is_new true
        set name "test name"
      }
    }`;

    const def = compose(compileToOldSpec(bp));
    const populator = def.populators[0];

    expect(populator).toMatchSnapshot();
  });

  it("succeeds for range iteration (only end)", () => {
    const bp = `
    model Org {
      field is_new { type boolean }
      field name { type string }
    }

    populator DevData {
      populate Org as org {
        repeat { end 3 }

        set is_new true
        set name "test name"
      }
    }`;

    const def = compose(compileToOldSpec(bp));
    const populator = def.populators[0];

    expect(populator).toMatchSnapshot();
  });

  it("succeeds for nested iterations", () => {
    const bp = `
    model Org {
      field is_new { type boolean }
      field name { type string }

      relation repos { from Repo, through org }
    }

    model Repo {
      field name { type string }

      reference org { to Org }
    }

    populator DevData {
      populate Org as org {
        repeat 4

        set is_new true
        set name "test name"

        populate repos as repo {
          repeat { start 20, end 2000 }

          set name "test name"
        }
      }
    }`;

    const def = compose(compileToOldSpec(bp));
    const populator = def.populators[0];

    expect(populator).toMatchSnapshot();
  });

  it("succeeds with iterator variables in the context", () => {
    const bp = `
      runtime MyRuntime {
        source path "./some/path"
      }

      model Org {
        field name { type string }
        field name2 { type string }
        field index { type integer }
        relation repos { from Repo, through org }
      }

      model Repo {
        reference org { to Org }
        field index { type integer }
        field org_index { type integer }
      }

      populator Dev {
        populate Org as org {
          repeat as oIter 10
          set name2 name
          set index oIter.current
          set name hook {
            arg oIter oIter
            inline "'Org ' + oIter.current"
          }
          populate repos as repo {
            repeat as rIter 5
            set index rIter.current
            set org_index oIter.current
          }
        }
      }
      `;

    const def = compose(compileToOldSpec(bp));
    const populator = def.populators[0];

    expect(populator).toMatchSnapshot();
  });
});

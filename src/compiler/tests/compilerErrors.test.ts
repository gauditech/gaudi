import _ from "lodash";

import { compilerErrorsToString } from "../compilerError";
import { compileToAST } from "../index";
import { authUserModelName } from "../plugins/authenticator";

function expectError(source: string, ...errorMessages: string[]) {
  const { errors } = compileToAST([{ source }]);
  // expect(errors).toHaveLength(errorMessages.length);
  errorMessages.forEach((errorMessage, i) => {
    expect(errors.at(i)?.message).toBe(errorMessage);
  });
}

describe("compiler errors", () => {
  describe("basic", () => {
    it("fails when relation points to a reference for another model", () => {
      const bp = `
        model Foo {
          reference parent { to Foo }
          reference baz { to Baz }
        }
        model Baz {
          relation foos { from Foo, through parent }
        }
        `;
      expectError(bp, `This reference has incorrect model`);
    });
    it('fails when using "set null" on delete action in non-nullable reference', () => {
      const bp = `
        model Foo {
          reference baz { to Baz, on delete set null }
        }
        model Baz {
          relation foo { from Foo, through baz }
        }
        `;
      expectError(bp, `Reference cannot be set to null on delete because it's not nullable`);
    });
    it("fails on name colision between field and reference", () => {
      const bp = `
        model Org {
          reference parent { to Org }
          field parent { type string }
        }
        `;
      expectError(bp, `Duplicate model member definition`);
    });
    it("fails when relation doesn't point to a reference", () => {
      const bp = `
        model Org {
          reference parent { to Org }
          field name { type string }
          relation children { from Org, through name }
        }
        `;
      expectError(bp, `Model member must be one of [reference], but field member was found`);
    });
    it("correctly fail when not able to resolve a ref", () => {
      const bp = `
        model Org { reference no { to UnknownModel } }
        `;
      expectError(bp, `Can't resolve model with this name`);
    });
    it("correctly fail when circular dependency is found in model members", () => {
      const bp = `
        model Org {
          computed foo { bar + 1 }
          computed bar { foo - 1 }
        }
        `;
      expectError(bp, `Circular model definition detected in model member definition`);
    });
  });

  describe("query", () => {
    it("fails when using first with limit or offset", () => {
      const bp = `
        model Foo {
          reference baz { to Baz }
        }
        model Baz {
          relation foos { from Foo, through baz }
          query foo { from foos, first, limit 10, offset 10 }
        }
        `;
      expectError(
        bp,
        `Query can't have "limit" when using "first"`,
        `Query can't have "offset" when using "first"`
      );
    });
    it("fails when using one with limit, offset or order by", () => {
      const bp = `
        model Foo {
          reference baz { to Baz }
        }
        model Baz {
          relation foos { from Foo, through baz }
          query foo { from foos, one, limit 10, offset 10, order by { id } }
        }
        `;
      expectError(
        bp,
        `Query can't have "limit" when using "one"`,
        `Query can't have "offset" when using "one"`,
        `Query can't have "order by" when using "one"`
      );
    });
  });

  describe("action", () => {
    it("fails when default action override is invalid type", () => {
      const bp = `
        model Org {
          field name { type string }
        }
        api {
          entrypoint Org {
            update endpoint {
              action {
                create {}
              }
            }
          }
        }
        `;
      expectError(
        bp,
        `When overriding default action, its kind must match with current endpoint kind. "create" is not a valid default action override in "update" endpoint`
      );
    });
    it("fails when reference and its field are being set at the same time", () => {
      const bp = `
        model Org { relation repos { from Repo, through org }}
        model Repo { reference org { to Org }}
        api {
          entrypoint Org as org {
            entrypoint repos {
              create endpoint {
                action {
                  create {
                    set org_id 1
                    set org org
                  }
                }
              }
            }
          }
        }
        `;
      expectError(bp, `Field used multiple times in a single action`);
    });
    it("fails when input and reference are on the same field", () => {
      const bp = `
        model Org {
          reference extras { to OrgExtra, unique }
        }
        model OrgExtra {
          relation org { from Org, through extras }
        }
        api {
          entrypoint Org as org {
            update endpoint {
              action {
                update org as ox {
                  input { extras_id }
                  reference extras through id
                }
              }
            }
          }
        }
        `;
      expectError(bp, `Field used multiple times in a single action`);
    });

    it("fails when there's an input and deny for the same field", () => {
      const bp = `
        model Org {
          field name { type string }
        }
        api {
          entrypoint Org as org {
            update endpoint {
              action {
                update org as ox {
                  input { name }
                  deny { name }
                }
              }
            }
          }
        }
        `;
      expectError(bp, `Field used multiple times in a single action`);
    });

    it("fails when custom action doesn't have an alias", () => {
      const bp = `
        model Org {
          field name { type string }
        }
        api {
          entrypoint Org {
            update endpoint {
              action {
                update {}
                create Org {}
              }
            }
          }
        }
        `;
      expectError(bp, `Non default "create" or "update" actions require alias`);
    });

    test.each(["Repo", "repo", "org"])(
      "fails when action alias uses existing model or context name %s",
      (name) => {
        const bp = `
          model Org { relation repos { from Repo, through org }}
          model Repo { reference org { to Org }}
          api {
            entrypoint Org as org {
              entrypoint repos as repo{
                create endpoint {
                  action {
                    create as repo {}
                    create Repo as ${name} {}
                  }
                }
              }
            }
          }
          `;
        expectError(bp, `This name is already defined in current scope`);
      }
    );
    // --- test missing/unallowed endpoint properties
    ["cardinality", "method", "path"].forEach((property) => {
      it(`fails when "${property}" property is missing in custom endpoint`, () => {
        const bp = `
          model Org { field name { type string } }
          model Log {}

          api {
            entrypoint Org {
              custom endpoint {
                // in each iteration skip one property
                ${property === "cardinality" ? "" : "cardinality many"}
                ${property === "method" ? "" : "method POST"}
                ${property === "path" ? "" : 'path "somePath"'}

                action {
                  create Log as log {}
                }
              }
            }
          }
          `;
        expectError(bp, `Endpoint of type "custom" must contain a "${property}"`);
      });
      ["get", "list", "create", "update", "delete"].forEach((epType) => {
        it(`fails when "${property}" property is used in "${epType}" endpoint`, () => {
          const bp = `
            model Org {}

            api {
              entrypoint Org {
                ${epType} endpoint {
                  // show one property in each iteration
                  ${property === "cardinality" ? "cardinality many" : ""}
                  ${property === "method" ? "method POST" : ""}
                  ${property === "path" ? 'path "somePath"' : ""}
                }
              }
            }
            `;
          expectError(bp, `Endpoint of type "${epType}" cannot contain a "${property}"`);
        });
      });
    });

    // --- test invalid action types in custom endpoints
    it(`fails when creating "one" endpoint with unallowed action "create"`, () => {
      const bp = `
        model Org {}
        model Log {}

        api {
          entrypoint Org as org {
            custom endpoint {
              cardinality one
              method POST
              path "somePath"

              action {
                create org as org2 {}
              }
            }
          }
        }
        `;
      expectError(
        bp,
        `This target is not supported in a "create" action, "create" can have model, relation and a nullable reference as a target`
      );
    });

    ["update org as org2", "delete org"].forEach((action) => {
      it(`fails when creating "many" endpoint with unallowed action "${action}"`, () => {
        const bp = `
          model Org {}
          model Log {}

          api {
            entrypoint Org as org {
              custom endpoint {
                cardinality many
                method POST
                path "somePath"

                action {
                  ${action} {}
                }
              }
            }
          }
          `;
        expectError(bp, `Name "org" does not exist in current scope`);
      });
    });
    it(`fails on duplicate endpoint paths`, () => {
      const bp = `
        model Org {}

        api {
          entrypoint Org {

            custom endpoint {
              cardinality many
              method POST
              path "someDuplicatePath"
            }

            custom endpoint {
              cardinality many
              method POST
              path "someDuplicatePath"
            }
          }
        }
        `;
      expectError(
        bp,
        `Custom endpoints on the same HTTP method must have unique paths in one entrypoint`
      );
    });
    it(`fails on custom endpoint path clashes with entrypoint`, () => {
      const bp = `
        model Org {
          relation repos { from Repo, through org }
        }

        model Repo {
          reference org { to Org }
        }

        api {
          entrypoint Org {

            entrypoint repos {
            }

            custom endpoint {
              cardinality one
              method POST
              path "repos"
            }
          }
        }
        `;
      expectError(bp, `Custom endpoint path clashes with entrypoint: "repos"`);
    });
  });

  describe("authenticator", () => {
    it("fails if authenticator model names are already taken", () => {
      const bp1 = `
        model ${authUserModelName} {}
        auth { method basic {} }
        `;
      expectError(bp1, `Duplicate model definition`);
      const bp2 = `
        model ${authUserModelName}AccessToken {}
        auth { method basic {} }
        `;
      expectError(bp2, `Duplicate model definition`);
    });
  });

  describe("runtime", () => {
    it("fails on missing source path", () => {
      const bp = `
        runtime DuplicateRuntime {
          default
        }
        `;
      expectError(bp, `"runtime" must contain a "sourcePath"`);
    });
    it("fails on duplicate runtime names", () => {
      const bp = `
        runtime DuplicateRuntime {
          default
          source path "./some/path/to/file1.js"
        }

        runtime DuplicateRuntime {
          source path "./some/path/to/file2.js"
        }
        `;
      expectError(bp, `Duplicate runtime definition`);
    });
    it("fails on no default runtime", () => {
      const bp = `
        runtime MyRuntime1 {
          source path "./some/path/to/file1.js"
        }

        runtime MyRuntime2 {
          source path "./some/path/to/file2.js"
        }
        `;
      expectError(bp, `When using multiple runtimes one runtime must be set as default`);
    });
    it("fails on multiple default runtime", () => {
      const bp = `
        runtime MyRuntime1 {
          default
          source path "./some/path/to/file1.js"
        }

        runtime MyRuntime2 {
          default
          source path "./some/path/to/file2.js"
        }
        `;
      expectError(bp, `Duplicate default runtime definition`);
    });
  });

  describe("generator", () => {
    it("fails for multiple generators with the same target/api", () => {
      const bp = `
        generate client {
          target js
          output "a/b/c"
        }

        generate client {
          target js
          output "a/b/c"
        }
        `;
      expectError(bp, `Found duplicate generator "client", targeting the same target "js"`);
    });
  });

  describe("populator", () => {
    it("fails when there's a name overlap in the context", () => {
      const bp = `
        model Org {
          field name { type string }
        }

        populator Dev {
          populate Org as myvar {
            repeat as myvar 10
            set name "myname"
          }
        }
        `;
      expectError(bp, `This name is already defined in current scope`);
    });
    it("fails when iterator name are shadowed", () => {
      const bp = `
        model Org {
          relation repos { from Repo, through org }
        }

        model Repo {
          reference org { to Org }
        }

        populator Dev {
          populate Org as org {
            repeat as iter 10

            populate repos as repo {
              repeat as iter 5
            }
          }
        }
        `;
      expectError(bp, `This name is already defined in current scope`);
    });
    it("fails when missing field setter", () => {
      const bp = `
        model Org {
          field name { type string }
          field description { type string }
          field active { type boolean }
        }

        populator DevData {
          populate Org as org {

            set name "test name"
            // missing field setters for "description" and "active" fields
          }
        }
        `;
      expectError(bp, `Populate block is missing setters for members: ["description","active"]`);
    });
  });

  describe("hook", () => {
    it("fails on invalid runtime name", () => {
      const bp = `
        runtime MyRuntime {
          source path "some/path/to/file"
        }

        api {
          entrypoint Org {
            create endpoint {
              action {
                create {
                  set name hook {
                    runtime InvalidMyRuntime
                    source randomSlug from "hooks.js"
                  }
                }
              }
            }
          }
        }
        `;
      expectError(bp, `Can't resolve model with this name`);
    });
  });

  describe("endpoint", () => {
    it("fail for multiple endpoints of the same type", () => {
      const bp = `
        model Org {}
        api {
          entrypoint Org {
            create endpoint {}
            create endpoint {}
          }
        }
        `;
      expectError(bp, `Duplicate "create" endpoint definition`);
    });
    it("fail for multiple actions that want to respond", () => {
      const bp = `
        runtime MyRuntime {
          source path "some/source/path"
        }

        model Org {}

        api {
          entrypoint Org {

            custom endpoint {
              path "somePath1"
              method POST
              cardinality many

              action {
                execute {
                  responds
                  hook {
                    runtime MyRuntime
                    source testFn from "t/h/p"
                  }
                }
                execute {
                  responds
                  hook {
                    runtime MyRuntime
                    source testFn from "t/h/p"
                  }
                }
              }
            }
          }
        }
        `;
      expectError(bp, `At most one action in endpoint can have "responds" attribute`);
    });
    it("fails if responds action is used in implicit endpoints", () => {
      const bp = `
        runtime MyRuntime {
          source path "some/source/path"
        }

        model Org {}

        api {
          entrypoint Org {

            create endpoint {
              action {
                execute {
                  responds
                  hook {
                    runtime MyRuntime
                    source testFn from "t/h/p"
                  }
                }
              }
            }
          }
        }
        `;
      expectError(bp, `Actions with "responds" can only be used in "custom" endpoints`);
    });
    it("fails if responds action is used in implicit actions", () => {
      const bp = `
        model Org {}

        api {
          entrypoint Org {

            custom endpoint {
              path "somePath"
              method POST
              cardinality many

              action {
                create {
                  responds
                }
              }
            }
          }
        }
        `;
      expectError(bp, `Expecting token of type --> RCurly <-- but found --> 'responds' <--`);
    });
    it("fails on wrong endpoint cardinality", () => {
      const bp = `
      model User {
        field name { type string }
        reference address { to Address, unique }
      }

      model Address {
        field name { type string }
        relation user { from User, through address }
      }

      api {
        entrypoint User {
          entrypoint address {
            create endpoint {}
            list endpoint {}
            delete endpoint {}
            custom endpoint {
              method GET
              cardinality many
              path "custom"
            }
          }
        }

        entrypoint Address {
          entrypoint user {
            list endpoint {}
            custom endpoint {
              method GET
              cardinality many
              path "custom"
            }
          }
        }
      }
      `;
      expectError(
        bp,
        `"create" endpoint is not supported in one cardinality entrypoint`,
        `"list" endpoint is not supported in one cardinality entrypoint`,
        `"delete" endpoint is not supported in one cardinality entrypoint`,
        `"custom-many" endpoint is not supported in one cardinality entrypoint`,
        `"list" endpoint is not supported in nullable cardinality entrypoint`,
        `"custom-many" endpoint is not supported in nullable cardinality entrypoint`
      );
    });
  });

  describe("function", () => {
    it("fail if function doesn't exist", () => {
      const bp = `
        model Org {
          computed test { foobar(4) }
        }
        `;
      expectError(bp, `Function with this name doesn't exist`);
    });
    it("fail if using function with incorrect number of arguments", () => {
      const bp = `
        model Org {
          computed test { length("test", 4) }
        }
        `;
      expectError(bp, `Function "length" expects 1 arguments, but got 2`);
    });
    it("fail if using wrong argument type in function", () => {
      const bp = `
        model Org {
          computed test { length(4) }
        }
        `;
      expectError(
        bp,
        `Unexpected type\nexpected:\n{"kind":"primitive","primitiveKind":"string"}\ngot:\n{"kind":"primitive","primitiveKind":"integer"}`
      );
    });
  });

  describe("reference / identify through", () => {
    it("succeeds with unique field, reference and relation", () => {
      const bp = `
      model Org {
        reference owner { to User, unique }
      }

      model User {
        relation orgs { from Org, through owner }
        // c:one because of unique relation
        relation profile { from Profile, through user }
      }

      model Profile {
        reference user { to User, unique }
        reference data { to Data, unique }
      }

      model Data {
        relation profile { from Profile, through data }
        field email { type string, unique, nullable }
      }

      api {
        entrypoint Org {
          identify { through owner.profile.data.email }
        }
      }
      `;
      const { errors } = compileToAST([{ source: bp }]);
      errors.length && console.log(compilerErrorsToString(bp, errors));
      expect(errors).toHaveLength(0);
    });

    it("fails when computed is used", () => {
      const bp = `
      model Org {
        reference owner { to User, unique }
      }

      model User {
        relation orgs { from Org, through owner }
        // c:one because of unique relation
        relation profile { from Profile, through user }
      }

      model Profile {
        reference user { to User, unique }
        reference data { to Data, unique }
      }

      model Data {
        relation profile { from Profile, through data }
        field email { type string, unique, nullable }
        computed email2 { email }
      }

      api {
        entrypoint Org {
          identify { through owner.profile.data.email2 }
        }
      }
      `;

      expectError(bp, `Unexpected model atom:\nexpected:\n"field"\ngot:\n"computed"`);
    });

    it("fails with non-unique field, reference and relation", () => {
      const bp = `
      model Org {
        reference owner { to User }
      }

      model User {
        relation orgs { from Org, through owner }
        // c:many because of non-unique relation
        relation profile { from Profile, through user }
      }

      model Profile {
        reference user { to User }
        reference data { to Data }
      }

      model Data {
        relation profile { from Profile, through data }
        field email { type string }
      }

      api {
        entrypoint Org {
          identify { through owner.profile.data.email }
        }
      }
      `;

      expectError(bp, ..._.times(4, () => `All atoms in this path must be "unique"`));
    });
  });
});

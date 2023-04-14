import { compileToAST } from "../index";

import { AUTH_TARGET_MODEL_NAME } from "@src/types/specification";

function expectError(source: string, errorMessage: string) {
  const { errors } = compileToAST(source);
  expect(errors.at(0)?.message).toBe(errorMessage);
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

  describe("action", () => {
    it("fails when default action override is invalid type", () => {
      const bp = `
        model Org {
          field name { type string }
        }
        entrypoint Orgs {
          target Org
          update endpoint {
            action {
              create {}
            }
          }
        }`;
      expectError(
        bp,
        `When overriding default action, its kind must match with current endpoint kind. "create" is not a valid default action override in "update" endpoint`
      );
    });
    it("fails when reference and its field are being set at the same time", () => {
      const bp = `
        model Org { relation repos { from Repo, through org }}
        model Repo { reference org { to Org }}
        entrypoint Org {
          target Org as org
          entrypoint Repos {
            target repos as repo
            create endpoint {
              action {
                create as repo {
                  set org_id 1
                  set org org
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
        entrypoint Orgs {
          target Org as org
          update endpoint {
            action {
              update org as ox {
                input { extras_id }
                reference extras through id
              }
            }
          }
        }`;
      expectError(bp, `Field used multiple times in a single action`);
    });

    it("fails when there's an input and deny for the same field", () => {
      const bp = `
        model Org {
          field name { type string }
        }
        entrypoint Orgs {
          target Org as org
          update endpoint {
            action {
              update org as ox {
                input { name }
                deny { name }
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
        entrypoint Orgs {
          target Org as org
          update endpoint {
            action {
              update {}
              create Org {}
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
          entrypoint O {
            target Org as org
            entrypoint R {
              target repos as repo
              create endpoint {
                action {
                  create as repo {}
                  create Repo as ${name} {}
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

          entrypoint Orgs {
            target Org as org
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
          `;
        expectError(bp, `"endpoint" must contain a "${property}"`);
      });
      ["get", "list", "create", "update", "delete"].forEach((epType) => {
        it(`fails when "${property}" property is used in "${epType}" endpoint`, () => {
          const bp = `
            model Org {}

            entrypoint Orgs {
              target Org
              ${epType} endpoint {
                // show one property in each iteration
                ${property === "cardinality" ? "cardinality many" : ""}
                ${property === "method" ? "method POST" : ""}
                ${property === "path" ? 'path "somePath"' : ""}
              }
            }
            `;
          expectError(
            bp,
            `Only custom endpoint can have method, cardinality and path configuration`
          );
        });
      });
    });

    // --- test invalid action types in custom endpoints
    it(`fails when creating "one" endpoint with unallowed action "create"`, () => {
      const bp = `
        model Org {}
        model Log {}

        entrypoint Orgs {
          target Org as org
          custom endpoint {
            cardinality one
            method POST
            path "somePath"

            action {
              create org as org2 {}
            }
          }
        }
        `;
      expectError(
        bp,
        `This target is not supported in a "create" action, "create" can only have model and relation as a target`
      );
    });

    ["update org as org2", "delete org"].forEach((action) => {
      it(`fails when creating "many" endpoint with unallowed action "${action}"`, () => {
        const bp = `
          model Org {}
          model Log {}

          entrypoint Orgs {
            target Org as org
            custom endpoint {
              cardinality many
              method POST
              path "somePath"

              action {
                ${action} {}
              }
            }
          }
          `;
        expectError(bp, `This name does not exist in current scope`);
      });
    });
    it(`fails on duplicate endpoint paths`, () => {
      const bp = `
        model Org {}

        entrypoint Orgs {
          target Org as org

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

        entrypoint Orgs {
          target Org as org

          entrypoint Repos {
            target repos
          }

          custom endpoint {
            cardinality one
            method POST
            path "repos"
          }
        }
        `;
      expectError(bp, `Custom endpoint path clashes with entrypoint: "repos"`);
    });
  });

  describe("authenticator", () => {
    it("fails if authenticator model names are already taken", () => {
      const bp1 = `
        model ${AUTH_TARGET_MODEL_NAME} {}
        auth { method basic {} }
        `;
      expectError(bp1, `Duplicate model definition`);
      const bp2 = `
        model ${AUTH_TARGET_MODEL_NAME}AccessToken {}
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
          api entrypoint
          output "a/b/c"
        }

        generate client {
          target js
          api entrypoint
          output "a/b/c"
        }
        `;
      expectError(
        bp,
        `Found duplicate generator "client", targeting the same target "js" and api "entrypoint"`
      );
    });
  });

  describe("populator", () => {
    it("fails when there's a name overlap in the context", () => {
      const bp = `
        model Org {
          field name { type string }
        }

        populator Dev {
          populate Orgs {
            repeater myvar 10
            target Org as myvar
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
          populate Orgs {
            target Org as org
            repeater iter 10

            populate Repos {
              target repos as repo
              repeater iter 5
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
          populate Orgs {
            target Org as org

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

        entrypoint Orgs {
          target Org as org
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
        `;
      expectError(bp, `Can't resolve model with this name`);
    });
  });

  describe("endpoint", () => {
    it("fail for multiple endpoints of the same type", () => {
      const bp = `
        model Org {}
        entrypoint Orgs {
          target Org
          create endpoint {}
          create endpoint {}
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

        entrypoint Orgs {
          target Org

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
        `;
      expectError(bp, `At most one action in endpoint can have "responds" attribute`);
    });
    it("fails if responds action is used in implicit endpoints", () => {
      const bp = `
        runtime MyRuntime {
          source path "some/source/path"
        }

        model Org {}

        entrypoint Orgs {
          target Org

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
        `;
      expectError(bp, `Actions with "responds" can only be used in "custom" endpoints`);
    });
    it("fails if responds action is used in implicit actions", () => {
      const bp = `
        model Org {}

        entrypoint Orgs {
          target Org

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
        `;
      expectError(bp, `Expecting token of type --> RCurly <-- but found --> 'responds' <--`);
    });
  });
});
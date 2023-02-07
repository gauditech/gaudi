import { compile, compose, parse } from "@src/index";
import { AUTH_TARGET_MODEL_NAME } from "@src/types/specification";

describe("authenticator composer", () => {
  it("succeeds for simple authenticator", () => {
    const bp = `
      auth {
        method basic {}
      }
    `;

    const def = compose(compile(parse(bp)));

    // check authenticator struct
    expect(def.authenticator).toMatchSnapshot();
    // check authenticator's models
    expect(def.models).toMatchSnapshot();
  });

  it("fails if authenticator model names are already taken", () => {
    const bp1 = `
        model ${AUTH_TARGET_MODEL_NAME} {}
  
        auth { method basic {} }
      `;

    expect(() => compose(compile(parse(bp1)))).toThrowErrorMatchingInlineSnapshot(
      `"Items not unique!"`
    );

    const bp2 = `
        model ${AUTH_TARGET_MODEL_NAME}AccessToken {}
  
        auth { method basic {} }
      `;

    expect(() => compose(compile(parse(bp2)))).toThrowErrorMatchingInlineSnapshot(
      `"Items not unique!"`
    );
  });

  it("resolves @auth model reference", () => {
    const bp = `
      model UserProfile {
        reference user { to @auth }
      }

      auth {
        method basic {}
      }
    `;

    const def = compose(compile(parse(bp)));

    // check authenticator's models
    expect(def.models).toMatchSnapshot();
  });

  it("succeeds for basic method actions", () => {
    const bp = `
      model UserProfile {
        field displayName { type text }
        reference user { to @auth }
      }

      auth {
        method basic {
          onRegisterAction {
            create UserProfile as userProfile {
              set displayName @auth.username
              set user @auth
            }
          }
        }
      }
    `;

    const def = compose(compile(parse(bp)));

    // check authenticator's models
    expect(def.models).toMatchSnapshot();
    // check authenticator struct
    expect(def.authenticator).toMatchSnapshot();
  });

  it("fails if authenticator custom event action has target's alias '@auth'", () => {
    const bp = `
      model UserProfile {}

      auth {
        method basic {
          onRegisterAction {
            create UserProfile as @auth {}
          }
        }
      }
    `;

    expect(() => compose(compile(parse(bp)))).toThrowErrorMatchingInlineSnapshot(
      `"Custom authenticator event action cannot have the same alias as the main target: @auth"`
    );
  });
});

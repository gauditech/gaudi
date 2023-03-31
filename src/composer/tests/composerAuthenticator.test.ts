import { getRef } from "@src/common/refs";
import { compileToOldSpec, compose } from "@src/index";
import { AUTH_TARGET_MODEL_NAME } from "@src/types/specification";

describe("authenticator composer", () => {
  it("succeeds for simple authenticator", () => {
    const bp = `
      auth {
        method basic {}
      }
    `;

    const def = compose(compileToOldSpec(bp));

    expect(def.authenticator).toMatchSnapshot();
    expect(def.models).toMatchSnapshot();
    expect(def.entrypoints).toMatchSnapshot();
  });

  it("resolves authenticator model implicit relations", () => {
    const bp = `
      model UserProfile {
        reference user { to AuthUser }
      }

      auth {
        method basic {}
      }
    `;

    const def = compose(compileToOldSpec(bp));

    const model = getRef.model(def, def.authenticator!.authUserModel.name);
    const relation = model.relations.find((rel) => rel.fromModel === "UserProfile");

    // check authenticator's models
    expect(relation).toMatchSnapshot();
  });
});

describe("authenticator compiler errors", () => {
  it("fails if authenticator model names are already taken", () => {
    const bp1 = `
        model ${AUTH_TARGET_MODEL_NAME} {}

        auth { method basic {} }
      `;

    expect(() => compileToOldSpec(bp1)).toThrowErrorMatchingInlineSnapshot(
      `"Duplicate model definition"`
    );

    const bp2 = `
        model ${AUTH_TARGET_MODEL_NAME}AccessToken {}

        auth { method basic {} }
      `;

    expect(() => compileToOldSpec(bp2)).toThrowErrorMatchingInlineSnapshot(
      `"Duplicate model definition"`
    );
  });

  it("fails if authenticator model names are already taken", () => {
    const bp1 = `
        model ${AUTH_TARGET_MODEL_NAME} {}

        auth { method basic {} }
      `;

    expect(() => compileToOldSpec(bp1)).toThrowErrorMatchingInlineSnapshot(
      `"Duplicate model definition"`
    );

    const bp2 = `
        model ${AUTH_TARGET_MODEL_NAME}AccessToken {}

        auth { method basic {} }
      `;

    expect(() => compileToOldSpec(bp2)).toThrowErrorMatchingInlineSnapshot(
      `"Duplicate model definition"`
    );
  });
});

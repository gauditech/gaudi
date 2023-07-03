import { getRef } from "@src/common/refs";
import { compileFromString } from "@src/runtime/common/testUtils";

describe("authenticator composer", () => {
  it("succeeds for simple authenticator", () => {
    const bp = `
      auth {
        method basic {}
      }
    `;

    const def = compileFromString(bp);

    expect(def.authenticator).toMatchSnapshot();
    expect(def.models).toMatchSnapshot();
    expect(def.apis[0].entrypoints).toMatchSnapshot();
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

    const def = compileFromString(bp);

    const model = getRef.model(def, def.authenticator!.authUserModel.name);
    const relation = model.relations.find((rel) => rel.fromModel === "UserProfile");

    // check authenticator's models
    expect(relation).toMatchSnapshot();
  });
});

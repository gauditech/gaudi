import { compileFromString } from "@compiler/common/testUtils";

describe("authenticator composer", () => {
  it("succeeds for simple authenticator", () => {
    const bp = `
      model AuthUser {}
      auth { model AuthUser }
    `;

    const def = compileFromString(bp);

    expect(def.authenticator).toMatchSnapshot();
  });

  it("@auth resolves to auth's model", () => {
    const bp = `
      model AuthUser {}
      auth { model AuthUser }
      api {
        entrypoint AuthUser {
          // @auth should resolve to auth's model
          authorize { @auth.id is not null}
          list endpoint {}
        }
      }
    `;

    const def = compileFromString(bp);

    expect(def.apis[0].entrypoints[0].endpoints[0].authorize).toMatchSnapshot();
  });
});

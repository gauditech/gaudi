import { compileFromString } from "@compiler/common/testUtils";

describe("generator composer", () => {
  it("succeeds for JS client generator", () => {
    const bp = `
      generator client {
        target js
      }
    `;

    const def = compileFromString(bp);
    const generator = def.generators[0];

    expect(generator).toMatchSnapshot();
  });

  it("succeeds for JS client generator with output", () => {
    const bp = `
      generator client {
        target js
        output "a/b/c"
      }
    `;

    const def = compileFromString(bp);
    const generators = def.generators;

    expect(generators).toMatchSnapshot();
  });
});

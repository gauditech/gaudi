import { compileToOldSpec, compose } from "@src/index";

describe("generator composer", () => {
  it("succeeds for JS client generator", () => {
    const bp = `
      generate client {
        target js
      }
    `;

    const def = compose(compileToOldSpec(bp));
    const generator = def.generators[0];

    expect(generator).toMatchSnapshot();
  });

  it("succeeds for JS client generator with output", () => {
    const bp = `
      generate client {
        target js
        output "a/b/c"
      }
    `;

    const def = compose(compileToOldSpec(bp));
    const generators = def.generators;

    expect(generators).toMatchSnapshot();
  });
});

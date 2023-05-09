import { compileToOldSpec, compose } from "@src/index.js";

describe("generator composer", () => {
  it("succeeds for JS client generator", () => {
    const bp = `
      generate client {
        target js
        api entrypoint
      }
    `;

    const def = compose(compileToOldSpec(bp));
    const generator = def.generators[0];

    expect(generator).toMatchSnapshot();
  });

  it("succeeds for multiple client generators", () => {
    const bp = `
      generate client {
        target js
        api entrypoint
        // without output
      }

      generate client {
        target js
        api model
        output "a/b/c"
      }
    `;

    const def = compose(compileToOldSpec(bp));
    const generators = def.generators;

    expect(generators).toMatchSnapshot();
  });
});

import { compileToOldSpec, compose } from "@src/index";

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

    expect(() => compileToOldSpec(bp)).toThrowErrorMatchingInlineSnapshot(
      `"Found duplicate generator "client", targeting the same target "js" and api "entrypoint""`
    );
  });
});

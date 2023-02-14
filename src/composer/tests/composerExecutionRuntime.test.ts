import { compile } from "@src/compiler/compiler";
import { compose } from "@src/composer/composer";
import { parse } from "@src/parser/parser";

describe("execution runtime composer", () => {
  it("compose execution runtime", () => {
    const bp = `
       runtime MyRuntime1 {
        sourcePath "./some/path/to/file1.js"
      }

      runtime MyRuntime2 {
        sourcePath "./some/path/to/file2.js"
      }
    `;

    const def = compose(compile(parse(bp)));
    const runtimes = def.runtimes;

    expect(runtimes).toMatchSnapshot();
  });

  it("fails on duplicate runtime names", () => {
    const bp = `
       runtime DuplicateRuntime {
        sourcePath "./some/path/to/file1.js"
      }

      runtime DuplicateRuntime {
        sourcePath "./some/path/to/file2.js"
      }
    `;

    expect(() => compose(compile(parse(bp)))).toThrowErrorMatchingInlineSnapshot(
      `"Execution runtime names must be unique"`
    );
  });
});

import { compile } from "@src/compiler/compiler";
import { compose } from "@src/composer/composer";
import { parse } from "@src/parser/parser";

describe("execution runtime composer", () => {
  it("composes single execution runtime", () => {
    const bp = `
       runtime MyRuntime1 {
        default
        sourcePath "./some/path/to/file1.js"
      }
    `;

    const def = compose(compile(parse(bp)));
    const runtimes = def.runtimes;

    expect(runtimes).toMatchSnapshot();
  });

  it("composes multiple execution runtimes", () => {
    const bp = `
      runtime MyRuntime1 {
        default
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

  it("makes a single runtime the default one", () => {
    const bp = `
       runtime MyRuntime1 {
        sourcePath "./some/path/to/file1.js"
      }
    `;

    const def = compose(compile(parse(bp)));
    const runtimes = def.runtimes;

    expect(runtimes).toMatchSnapshot();
  });

  it("fails on missing source path", () => {
    const bp = `
       runtime DuplicateRuntime {
        default
      }
    `;

    expect(() => compose(compile(parse(bp)))).toThrowErrorMatchingInlineSnapshot(
      `"Runtime source path cannot be empty"`
    );
  });

  it("fails on duplicate runtime names", () => {
    const bp = `
       runtime DuplicateRuntime {
        default
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

  it("fails on no default runtime", () => {
    const bp = `
      runtime MyRuntime1 {
        sourcePath "./some/path/to/file1.js"
      }

      runtime MyRuntime2 {
        sourcePath "./some/path/to/file2.js"
      }
    `;

    expect(() => compose(compile(parse(bp)))).toThrowErrorMatchingInlineSnapshot(
      `"There can be only one default execution runtime"`
    );
  });

  it("fails on multiple default runtime", () => {
    const bp = `
      runtime MyRuntime1 {
        default
        sourcePath "./some/path/to/file1.js"
      }

      runtime MyRuntime2 {
        default
        sourcePath "./some/path/to/file2.js"
      }
    `;

    expect(() => compose(compile(parse(bp)))).toThrowErrorMatchingInlineSnapshot(
      `"There can be only one default execution runtime"`
    );
  });
});

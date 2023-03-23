import { compileToOldSpec, compose } from "@src/index";

describe("execution runtime composer", () => {
  it("composes single execution runtime", () => {
    const bp = `
       runtime MyRuntime1 {
        default
        source path "./some/path/to/file1.js"
      }
    `;

    const def = compose(compileToOldSpec(bp));
    const runtimes = def.runtimes;

    expect(runtimes).toMatchSnapshot();
  });

  it("composes multiple execution runtimes", () => {
    const bp = `
      runtime MyRuntime1 {
        default
        source path "./some/path/to/file1.js"
      }

      runtime MyRuntime2 {
        source path "./some/path/to/file2.js"
      }
    `;

    const def = compose(compileToOldSpec(bp));
    const runtimes = def.runtimes;

    expect(runtimes).toMatchSnapshot();
  });

  it("makes a single runtime the default one", () => {
    const bp = `
       runtime MyRuntime1 {
        source path "./some/path/to/file1.js"
      }
    `;

    const def = compose(compileToOldSpec(bp));
    const runtimes = def.runtimes;

    expect(runtimes).toMatchSnapshot();
  });
});

describe("execution runtime compiler errors", () => {
  it("fails on missing source path", () => {
    const bp = `
       runtime DuplicateRuntime {
        default
      }
    `;

    expect(() => compileToOldSpec(bp)).toThrowErrorMatchingInlineSnapshot(
      `"'runtime' must contain a 'sourcePath'"`
    );
  });

  it("fails on duplicate runtime names", () => {
    const bp = `
       runtime DuplicateRuntime {
        default
        source path "./some/path/to/file1.js"
      }

      runtime DuplicateRuntime {
        source path "./some/path/to/file2.js"
      }
    `;

    expect(() => compileToOldSpec(bp)).toThrowErrorMatchingInlineSnapshot(
      `"Duplicate runtime definition"`
    );
  });

  it("fails on no default runtime", () => {
    const bp = `
      runtime MyRuntime1 {
        source path "./some/path/to/file1.js"
      }

      runtime MyRuntime2 {
        source path "./some/path/to/file2.js"
      }
    `;

    expect(() => compileToOldSpec(bp)).toThrowErrorMatchingInlineSnapshot(
      `"When using multiple runtimes one runtime must be set as default"`
    );
  });

  it("fails on multiple default runtime", () => {
    const bp = `
      runtime MyRuntime1 {
        default
        source path "./some/path/to/file1.js"
      }

      runtime MyRuntime2 {
        default
        source path "./some/path/to/file2.js"
      }
    `;

    expect(() => compileToOldSpec(bp)).toThrowErrorMatchingInlineSnapshot(
      `"Duplicate default runtime definition"`
    );
  });
});

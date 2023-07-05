import { compileFromString } from "@compiler/common/testUtils";

describe("execution runtime composer", () => {
  it("composes single execution runtime", () => {
    const bp = `
       runtime MyRuntime1 {
        default
        source path "./some/path/to/file1.js"
      }
    `;

    const def = compileFromString(bp);
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

    const def = compileFromString(bp);
    const runtimes = def.runtimes;

    expect(runtimes).toMatchSnapshot();
  });

  it("makes a single runtime the default one", () => {
    const bp = `
       runtime MyRuntime1 {
        source path "./some/path/to/file1.js"
      }
    `;

    const def = compileFromString(bp);
    const runtimes = def.runtimes;

    expect(runtimes).toMatchSnapshot();
  });
});

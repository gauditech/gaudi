const moduleNameMapper = {
  // FIXME: remove "@compiler" alias once it's removed from "compiler"'s output
  "@compiler/(.*)": ["<rootDir>/../compiler/dist/$1"],
  // TOOD: read alias from tsconfig.json - https://kulshekhar.github.io/ts-jest/docs/getting-started/paths-mapping
  "@runtime/(.*)": ["<rootDir>/src/$1"],
};
const transform = {
  "^.+\\.[jt]s$": [
    "ts-jest",
    {
      // prevent jest from trying to compile external modules otherwise it fails with eg. "Module '@gaudi/compiler' has no exported member 'Definition'."
      // no clue how to fix this but maybe it's ok for tests not to do comprehensive compiling, just run tests?
      isolatedModules: true,
    },
  ],
};

/** @returns {Promise<import('jest').JestConfigWithTsJest>} */
module.exports = async () => {
  return {
    verbose: true,
    showSeed: true,
    projects: [
      // --- unit tests
      {
        displayName: "unit",
        preset: "ts-jest",
        testEnvironment: "node",
        roots: ["<rootDir>/src"],
        modulePathIgnorePatterns: ["<rootDir>/src/e2e"],
        transform,
        moduleNameMapper,
      },
      // --- api tests
      {
        displayName: "api",
        preset: "ts-jest",
        testEnvironment: "node",
        roots: ["<rootDir>/src/e2e/api"],
        transform,
        moduleNameMapper,
      },
      // --- client tests
      {
        displayName: "client",
        preset: "ts-jest",
        testEnvironment: "node",
        roots: ["<rootDir>/src/e2e/client"],
        transform,
        moduleNameMapper,
        globalSetup: "<rootDir>/src/e2e/client/setupTests.ts",
      },
    ],
  };
};

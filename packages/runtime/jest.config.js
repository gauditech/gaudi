const commonOptions = {
  transform: {
    "^.+\\.[jt]s$": [
      "ts-jest",
      {
        // use tspc as compiler in order to use plugins from tsconfig
        compiler: "ts-patch/compiler",
        tsconfig: "./tsconfig.test.json",
      },
    ],
  },
};

/** @returns {Promise<import('jest').JestConfigWithTsJest>} */
module.exports = async () => {
  return {
    verbose: true,
    showSeed: true,
    projects: [
      // --- unit tests
      {
        ...commonOptions,

        displayName: "unit",
        preset: "ts-jest",
        testEnvironment: "node",
        roots: ["<rootDir>/src"],
        modulePathIgnorePatterns: ["<rootDir>/src/e2e"],
      },
      // --- api tests
      {
        ...commonOptions,

        displayName: "api",
        preset: "ts-jest",
        testEnvironment: "node",
        roots: ["<rootDir>/src/e2e/api"],
      },
      // --- client tests
      {
        ...commonOptions,

        displayName: "client",
        preset: "ts-jest",
        testEnvironment: "node",
        roots: ["<rootDir>/src/e2e/client"],
        globalSetup: "<rootDir>/src/e2e/client/setupTests.ts",
      },
    ],
  };
};

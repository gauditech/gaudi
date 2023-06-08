/** @returns {Promise<import('jest').JestConfigWithTsJest>} */
module.exports = async () => {
  return {
    verbose: true,
    projects: [
      // --- unit tests
      {
        displayName: "unit",
        preset: "ts-jest",
        testEnvironment: "node",
        roots: ["<rootDir>/src"],
        modulePathIgnorePatterns: ["<rootDir>/src/e2e"],
        moduleNameMapper: {
          "@src/(.*)": "<rootDir>/src/$1",
        },
      },
      // --- api tests
      {
        displayName: "api",
        preset: "ts-jest",
        testEnvironment: "node",
        roots: ["<rootDir>/src/e2e/api"],
        moduleNameMapper: {
          "@src/(.*)": "<rootDir>/src/$1",
        },
        globalSetup: "<rootDir>/src/e2e/jest/setupApi.ts",
        globalTeardown: "<rootDir>/src/e2e/jest/teardownApi.ts",
      },
      // --- client tests
      {
        displayName: "client",
        preset: "ts-jest",
        testEnvironment: "node",
        roots: ["<rootDir>/src/e2e/client"],
        moduleNameMapper: {
          "@src/(.*)": "<rootDir>/src/$1",
        },
        globalSetup: "<rootDir>/src/e2e/jest/setupClient.ts",
        globalTeardown: "<rootDir>/src/e2e/jest/teardownClient.ts",
      },
    ],
  };
};

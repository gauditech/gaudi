/** @returns {Promise<import('jest').JestConfigWithTsJest>} */
module.exports = async () => {
  return {
    projects: [
      // --- unit tests
      {
        displayName: "unit",
        verbose: true,
        preset: "ts-jest",
        testEnvironment: "node",
        roots: ["<rootDir>/src"],
        modulePathIgnorePatterns: ["<rootDir>/src/e2e"],
        moduleNameMapper: {
          "@src/(.*)": "<rootDir>/src/$1",
        },
        snapshotSerializers: ["<rootDir>/src/tests/gaudiSerializer.js"],
      },
      // --- api tests
      {
        displayName: "api",
        verbose: true,
        preset: "ts-jest",
        testEnvironment: "node",
        roots: ["<rootDir>/src/e2e/api"],
        moduleNameMapper: {
          "@src/(.*)": "<rootDir>/src/$1",
        },
        snapshotSerializers: ["<rootDir>/src/tests/gaudiSerializer.js"],
      },
      // --- client tests
      {
        displayName: "client",
        verbose: true,
        preset: "ts-jest",
        testEnvironment: "node",
        roots: ["<rootDir>/src/e2e/client"],
        moduleNameMapper: {
          "@src/(.*)": "<rootDir>/src/$1",
        },
        setupFiles: ["<rootDir>/src/e2e/client/setupTests.ts"],
        snapshotSerializers: ["<rootDir>/src/tests/gaudiSerializer.js"],
      },
    ],
  };
};

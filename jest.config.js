/** @returns {Promise<import('jest').Config>} */
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
      // --- e2e tests
      {
        displayName: "e2e",
        verbose: true,
        preset: "ts-jest",
        testEnvironment: "node",
        roots: ["<rootDir>/src/e2e"],
        moduleNameMapper: {
          "@src/(.*)": "<rootDir>/src/$1",
        },
        setupFiles: ["<rootDir>/src/e2e/client/setup.ts"],
        snapshotSerializers: ["<rootDir>/src/tests/gaudiSerializer.js"],
      },
    ],
  };
};

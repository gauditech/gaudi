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
        moduleNameMapper: {
          "@compiler/(.*)": "<rootDir>/src/$1",
        },
      },
    ],
  };
};

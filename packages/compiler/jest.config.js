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
      },
    ],
  };
};

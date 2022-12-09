/** @returns {Promise<import('jest').Config>} */
module.exports = async () => {
  return {
    verbose: true,
    preset: "ts-jest",
    modulePathIgnorePatterns: ["<rootDir>/dist/"],
    moduleNameMapper: {
      "@src/(.*)": "<rootDir>/src/$1",
    },
    snapshotSerializers: ["<rootDir>/src/tests/gaudiSerializer.js"],
  };
};

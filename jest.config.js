/** @returns {Promise<import('jest').Config>} */
module.exports = async () => {
  return {
    verbose: true,
    preset: "ts-jest",
    modulePathIgnorePatterns: ["<rootDir>/dist/"],
    moduleNameMapper: {
      "examples/(.*)": "<rootDir>/examples/$1",
    },
  };
};

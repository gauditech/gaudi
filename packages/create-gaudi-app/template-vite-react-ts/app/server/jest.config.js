module.exports = async () => {
  return {
    roots: ["<rootDir>/src"],
    testEnvironment: "node",
    preset: "ts-jest",
  };
};

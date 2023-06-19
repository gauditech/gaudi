module.exports = async () => {
  return {
    roots: ["<rootDir>/src"],
    setupFilesAfterEnv: ["<rootDir>/scripts/jest/setupTests.ts"],
    moduleNameMapper: {
      "\\.(css|less|sass|scss)$": "<rootDir>/scripts/jest/fileMock.ts",
      "\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2)$":
        "<rootDir>/scripts/jest/fileMock.ts",
    },
    testEnvironment: "jsdom",
    preset: "ts-jest",
    transform: {
      "^.+\\.tsx?$": [
        "ts-jest",
        {
          // no need for type checking when running tests
          isolatedModules: true,
          // se custom tsconfig for tests
          tsconfig: "<rootDir>/tsconfig.test.json",
        },
      ],
    },
  };
};

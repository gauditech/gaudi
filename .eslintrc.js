module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "import"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/recommended",
    "plugin:import/typescript",
    "prettier",
  ],
  settings: {
    "import/resolver": {
      typescript: {
        project: ["tsconfig.json", "packages/**/tsconfig.json"],
      },
    },
  },
  rules: {
    "sort-imports": [
      "warn",
      {
        ignoreDeclarationSort: true,
      },
    ],
    "import/order": [
      "warn",
      {
        "newlines-between": "always",
        alphabetize: { order: "asc" },
      },
    ],
    "import/newline-after-import": "warn",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        // ignoreRestSiblings: true,
      },
    ],
  },
  ignorePatterns: [".eslintrc.js", "dist", "create-gaudi-app"],
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2018,
  },
};

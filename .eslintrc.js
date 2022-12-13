module.exports = {
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: "./tsconfig.json", // required for rules that need type information
    ecmaVersion: 2021,
    sourceType: "module",
  },
  env: {
    browser: true,
    commonjs: true,
    es6: true,
    node: true,
  },
  plugins: ["@typescript-eslint", "prettier", "mobx"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "plugin:mobx/recommended",
    "prettier",
  ],
  rules: {
    "no-console": ["error", { allow: ["error", "log"] }],
    "no-empty": "off",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/no-use-before-define": "off",
    "@typescript-eslint/no-unused-vars": "warn",
    "@typescript-eslint/camelcase": "off",
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/restrict-template-expressions": [
      "error",
      { allowBoolean: true, allowNumber: true, allowNullish: true },
    ],
    "mobx/exhaustive-make-observable": "off",
  },
};

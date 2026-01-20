module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2020: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  ignorePatterns: [
    "node_modules/",
    "dist/",
    "output/",
    "packages/extension/dist/",
    "packages/extension/.vite/",
  ],
  rules: {
    "@typescript-eslint/no-unused-vars": "off",
    "no-unused-vars": "off",
  },
  overrides: [
    {
      files: ["packages/extension/src/content/content-script.ts"],
      rules: {
        "no-inner-declarations": "off",
      },
    },
  ],
};

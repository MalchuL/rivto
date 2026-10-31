/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  moduleNameMapper: {
    "^@chulane/rivto-utils$": "<rootDir>/../rivto-utils/src/index.ts",
    "^@chulane/rivto-keyboard$": "<rootDir>/../rivto-keyboard/src/index.ts",
  },
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  testEnvironment: "jsdom",
  roots: ["<rootDir>/src", "<rootDir>/demo"],
  transform: {
    "^.+\\.tsx?$": ["<rootDir>/jest-transformer.cjs", { tsconfig: { module: "commonjs" } }],
  },
};

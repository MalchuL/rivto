/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  moduleNameMapper: {
    "^@chulane/rivto-root/browser$": "<rootDir>/../rivto-root/src/browser.ts",
    "^@chulane/rivto-root$": "<rootDir>/../rivto-root/src/index.ts",
  },
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  testEnvironment: "jsdom",
  roots: ["<rootDir>/src", "<rootDir>/demo"],
  transform: {
    "^.+\\.tsx?$": ["<rootDir>/jest-transformer.cjs", { tsconfig: { module: "commonjs" } }],
  },
};

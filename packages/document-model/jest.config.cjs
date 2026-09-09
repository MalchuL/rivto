/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.+(ts|tsx|js)", "**/?(*.)+(spec|test).+(ts|tsx|js)"],
  moduleNameMapper: {
    "^@chulane/crdt-doc$": "<rootDir>/../crdt-doc/src/index.ts",
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.[tj]sx?$": [
      "<rootDir>/jest-transformer.cjs",
      {
        tsconfig: {
          module: "commonjs",
          allowJs: true,
        },
      },
    ],
  },
  transformIgnorePatterns: [],
};

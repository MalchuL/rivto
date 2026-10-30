/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/?(*.)+(spec|test).ts"],
  moduleNameMapper: {
    "^@chulane/rivto-utils$": "<rootDir>/../rivto-utils/src/index.ts",
    "^@chulane/graph-runtime$": "<rootDir>/../graph-runtime/src/index.ts",
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.ts$": [
      "<rootDir>/../crdt-doc/jest-transformer.cjs",
      {
        tsconfig: { module: "commonjs" },
      },
    ],
  },
  transformIgnorePatterns: [],
};

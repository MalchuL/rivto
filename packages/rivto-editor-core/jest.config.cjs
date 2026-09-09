/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.+(ts|tsx|js)", "**/?(*.)+(spec|test).+(ts|tsx|js)"],
  testPathIgnorePatterns: ["<rootDir>/src/.stuff/"],
  moduleNameMapper: {
    "^@chulane/crdt-doc$": "<rootDir>/../crdt-doc/src/index.ts",
    "^@chulane/document-model$": "<rootDir>/../document-model/src/index.ts",
    "^@/(.*)$": "<rootDir>/src/$1",
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

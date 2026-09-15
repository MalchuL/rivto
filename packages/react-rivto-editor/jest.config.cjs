/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  testEnvironment: "node",
  moduleNameMapper: {
    "^@chulane/crdt-doc$": "<rootDir>/../crdt-doc/src/index.ts",
    "^@chulane/document-model$": "<rootDir>/../document-model/src/index.ts",
    "^@chulane/rivto$": "<rootDir>/../rivto-editor-core/src/index.ts",
    "^react-markdown$": "<rootDir>/src/test-mocks/react-markdown.ts",
    "^rehype-highlight$": "<rootDir>/src/test-mocks/empty-plugin.ts",
    "^remark-gfm$": "<rootDir>/src/test-mocks/empty-plugin.ts",
  },
  transform: {
    "^.+\\.tsx?$": [
      "<rootDir>/jest-transformer.cjs",
      { tsconfig: "tsconfig.json", useESM: true },
    ],
  },
};

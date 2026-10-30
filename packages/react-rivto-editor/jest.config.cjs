/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  testEnvironment: "node",
  moduleNameMapper: {
    "^@chulane/rivto-page$": "<rootDir>/../rivto-page/src/index.ts",
    "^@chulane/rivto-edgeless/react$": "<rootDir>/../rivto-edgeless/src/react.ts",
    "^@chulane/rivto-edgeless/browser$": "<rootDir>/../rivto-edgeless/src/browser.ts",
    "^@chulane/rivto-edgeless$": "<rootDir>/../rivto-edgeless/src/index.ts",
    "^@chulane/rivto-keyboard$": "<rootDir>/../rivto-keyboard/src/index.ts",
    "^@chulane/crdt-doc$": "<rootDir>/../crdt-doc/src/index.ts",
    "^@chulane/document-model$": "<rootDir>/../document-model/src/index.ts",
    "^@chulane/rivto$": "<rootDir>/../rivto-editor-core/src/index.ts",
    "^react-markdown$": "<rootDir>/src/test-mocks/react-markdown.ts",
    "^rehype-highlight$": "<rootDir>/src/test-mocks/empty-plugin.ts",
    "^remark-gfm$": "<rootDir>/src/test-mocks/empty-plugin.ts",
    "^@openuidev/react-lang$": "<rootDir>/src/test-mocks/openui-react-lang.tsx",
    "^@openuidev/react-ui$": "<rootDir>/src/test-mocks/openui-react-ui.ts",
  },
  transform: {
    "^.+\\.tsx?$": ["<rootDir>/jest-transformer.cjs", { tsconfig: "tsconfig.json", useESM: true }],
  },
};

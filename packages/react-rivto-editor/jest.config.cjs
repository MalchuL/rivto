module.exports = {
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  moduleNameMapper: { "^@chulane/rivto$": "<rootDir>/../rivto-editor-core/src/index.ts" },
  transform: { "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.json", useESM: true }] },
};

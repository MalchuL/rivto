module.exports = {
  testMatch: ["<rootDir>/src/**/*.test.ts", "<rootDir>/src/**/*.test.tsx"],
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  moduleNameMapper: { "^@chulane/rivto-utils$": "<rootDir>/../rivto-utils/src/index.ts" },
  testEnvironment: "node",
  transform: { "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.json", useESM: true }] },
};

module.exports = {
  moduleNameMapper: { "^@chulane/rivto-root/browser$": "<rootDir>/../rivto-root/src/browser.ts", "^@chulane/rivto-root$": "<rootDir>/../rivto-root/src/index.ts" },
  testMatch: ["<rootDir>/src/**/*.test.ts", "<rootDir>/src/**/*.test.tsx"],
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  testEnvironment: "node",
  transform: { "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.json", useESM: true }] },
};

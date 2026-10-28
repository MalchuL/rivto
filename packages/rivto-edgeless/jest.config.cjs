module.exports = {
  testMatch: ["<rootDir>/src/**/*.test.ts", "<rootDir>/src/**/*.test.tsx"],
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  testEnvironment: "node",
  transform: { "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.json", useESM: true }] },
};

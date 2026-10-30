export default {
  moduleNameMapper: { "^@chulane/rivto-utils$": "<rootDir>/../rivto-utils/src/index.ts" },
  testEnvironment: "jsdom",
  roots: ["<rootDir>/src"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: { module: "commonjs" } }],
  },
};

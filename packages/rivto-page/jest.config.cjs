/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: "jsdom",
  roots: ["<rootDir>/src"],
  transform: {
    "^.+\\.tsx?$": ["<rootDir>/jest-transformer.cjs", { tsconfig: { module: "commonjs" } }],
  },
};

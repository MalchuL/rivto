/**
 * Regression coverage for the built-in React extension dependency direction.
 *
 * The cases lock the allowed inward dependency and reject the reverse edge
 * without creating fixture files inside the package source tree.
 *
 * @module
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RuleTester } from "eslint";
import rule from "./no-built-in-extension-imports.js";

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));

/**
 * Creates an absolute virtual source filename below the React extension root.
 *
 * @param segments - Path segments below `src/extensions`.
 * @returns Absolute filename consumed by ESLint's RuleTester.
 */
const sourceFile = (...segments) => path.join(
  REPOSITORY_ROOT,
  "packages/react-rivto-editor/src/extensions",
  ...segments,
);

const tester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: "module" } });

tester.run("no-built-in-extension-imports", rule, {
  valid: [
    {
      filename: sourceFile("built-ins/page/example.ts"),
      code: 'import "../selection/example";',
    },
    {
      filename: sourceFile("example/example.ts"),
      code: 'import "../built-ins/page/example";',
    },
    {
      filename: sourceFile("built-ins/page/example.ts"),
      code: 'import "../../../managers/example";',
    },
  ],
  invalid: [
    {
      filename: sourceFile("built-ins/page/example.ts"),
      code: 'import "../../example/example";',
      errors: [{ messageId: "reverseDependency" }],
    },
  ],
});

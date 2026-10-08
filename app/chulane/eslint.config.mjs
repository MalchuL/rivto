/**
 * Applies the CLI-generated Next.js and TypeScript lint rules to Chulane.
 * Application entry points use TypeScript ES modules. Compiled runtime output,
 * Next.js output, and browser-test artifacts are excluded from source checks.
 */
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-desktop/**",
    "out/**",
    "build/**",
    "dist/**",
    "next-env.d.ts",
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;

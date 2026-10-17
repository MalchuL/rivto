import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import jsdoc from "eslint-plugin-jsdoc";
import prettier from "eslint-config-prettier/flat";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";
import noBuiltInExtensionImports from "./eslint-rules/no-built-in-extension-imports.js";

const methodDocumentation = {
  enableFixer: false,
  exemptEmptyConstructors: false,
  exemptEmptyFunctions: false,
  checkConstructors: true,
  checkGetters: true,
  checkSetters: true,
  contexts: [
    "Property[method=true]",
    "TSMethodSignature",
    "PropertyDefinition[value.type='ArrowFunctionExpression']",
    "PropertyDefinition[value.type='FunctionExpression']",
  ],
  require: {
    FunctionDeclaration: false,
    MethodDefinition: true,
  },
};

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.stuff/**",
      "**/.next/**",
      "**/out/**",
      "**/release/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/.pnpm-store/**",
      "playwright-report/**",
      "test-results/**",
      "reports/**",
      "**/encore.gen/**",
      "**/encore.gen.ts",
      "**/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { jsdoc },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-nested-ternary": "error",
      "max-lines-per-function": ["warn", 50],
      "jsdoc/require-jsdoc": ["error", methodDocumentation],
      "@typescript-eslint/member-ordering": [
        "error",
        {
          default: {
            memberTypes: [
              [
                "signature",
                "call-signature",
                "field",
                "accessor",
                "static-initialization",
                "constructor",
                "get",
                "set",
                "public-method",
                "protected-method",
              ],
              ["private-method", "#private-method"],
            ],
          },
          interfaces: "never",
          typeLiterals: "never",
        },
      ],
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    files: ["app/**/*.ts", "app/**/*.tsx"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    files: ["packages/react-rivto-editor/src/**/*.ts", "packages/react-rivto-editor/src/**/*.tsx"],
    rules: {
      // The `@/*` path alias exists only so the shadcn CLI can resolve
      // components.json; the demo and app/web compile this package from source
      // and app/web owns a conflicting `@/*` alias, so package code must stay
      // relative. `pnpm ui:add` rewrites generated alias imports automatically.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/*"],
              message:
                "Use relative imports inside @chulane/rivto-react; run `pnpm ui:add` so shadcn output is rewritten.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "packages/react-rivto-editor/src/extensions/built-ins/**/*.ts",
      "packages/react-rivto-editor/src/extensions/built-ins/**/*.tsx",
    ],
    plugins: {
      "rivto-boundaries": {
        rules: {
          "no-built-in-extension-imports": noBuiltInExtensionImports,
        },
      },
    },
    rules: {
      "rivto-boundaries/no-built-in-extension-imports": "error",
    },
  },
  {
    files: [
      "packages/rivto-editor-core/src/editor/**/*.ts",
      "packages/rivto-editor-core/src/editor/**/*.tsx",
      "packages/document-model/src/**/*.ts",
    ],
    ignores: [
      "packages/rivto-editor-core/src/**/__tests__/**",
      "packages/document-model/src/**/__tests__/**",
      "packages/document-model/src/**/*.test.ts",
    ],
    plugins: { jsdoc },
    rules: {
      "jsdoc/require-jsdoc": [
        "error",
        {
          ...methodDocumentation,
          require: {
            ArrowFunctionExpression: false,
            ClassDeclaration: true,
            ClassExpression: true,
            FunctionDeclaration: true,
            FunctionExpression: false,
            MethodDefinition: true,
          },
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "yjs",
              message:
                "Use CRDTDoc/CRDTMap/CRDTArray/CRDTText; native Yjs belongs only in @chulane/crdt-doc.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "packages/crdt-doc/src/**/__tests__/**/*.ts",
      "packages/crdt-doc/src/**/*.test.ts",
      "packages/document-model/src/**/__tests__/**/*.ts",
      "packages/document-model/src/**/*.test.ts",
      "packages/rivto-editor-core/src/**/__tests__/**/*.ts",
      "packages/rivto-editor-core/src/**/*.test.ts",
      "packages/react-rivto-editor/src/**/__tests__/**/*.ts",
      "packages/react-rivto-editor/src/**/*.test.ts",
    ],
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },
  prettier,
  {
    plugins: { "@stylistic": stylistic },
    rules: {
      curly: ["error", "all"],
      "@stylistic/curly-newline": ["error", { minElements: 1, consistent: true }],
    },
  },
);

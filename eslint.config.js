import js from "@eslint/js";
import jsdoc from "eslint-plugin-jsdoc";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist", "packages/*/dist", "demo/dist", "node_modules", "packages/rivto-editor-core/src/.stuff"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["packages/rivto-editor-core/src/**/*.ts", "packages/rivto-editor-core/src/**/*.tsx", "packages/react-rivto-editor/src/**/*.ts", "packages/react-rivto-editor/src/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    },
  },
  {
    files: ["packages/rivto-editor-core/src/editor/**/*.ts", "packages/rivto-editor-core/src/editor/**/*.tsx", "packages/rivto-editor-core/src/store/document-model/**/*.ts"],
    ignores: ["packages/rivto-editor-core/src/**/__tests__/**"],
    plugins: { jsdoc },
    rules: {
      "jsdoc/require-jsdoc": ["error", {
        exemptEmptyConstructors: false,
        require: {
          ArrowFunctionExpression: false,
          ClassDeclaration: true,
          ClassExpression: true,
          FunctionDeclaration: true,
          FunctionExpression: false,
          MethodDefinition: true,
        },
      }],
      "no-restricted-imports": ["error", {
        "paths": [{ "name": "yjs", "message": "Use CRDTDoc/CRDTMap/CRDTArray/CRDTText; native Yjs belongs only in the adapter." }]
      }],
    },
  },
  {
    files: ["packages/rivto-editor-core/src/**/__tests__/**/*.ts", "packages/rivto-editor-core/src/**/*.test.ts", "packages/react-rivto-editor/src/**/__tests__/**/*.ts", "packages/react-rivto-editor/src/**/*.test.ts"],
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);

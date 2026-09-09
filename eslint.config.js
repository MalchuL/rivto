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
    files: ["packages/crdt-doc/src/**/*.ts", "packages/document-model/src/**/*.ts", "packages/rivto-editor-core/src/**/*.ts", "packages/rivto-editor-core/src/**/*.tsx", "packages/react-rivto-editor/src/**/*.ts", "packages/react-rivto-editor/src/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    },
  },
  {
    files: ["packages/rivto-editor-core/src/editor/**/*.ts", "packages/rivto-editor-core/src/editor/**/*.tsx", "packages/document-model/src/**/*.ts"],
    ignores: ["packages/rivto-editor-core/src/**/__tests__/**", "packages/document-model/src/**/__tests__/**", "packages/document-model/src/**/*.test.ts"],
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
        "paths": [{ "name": "yjs", "message": "Use CRDTDoc/CRDTMap/CRDTArray/CRDTText; native Yjs belongs only in @chulane/crdt-doc." }]
      }],
    },
  },
  {
    files: ["packages/crdt-doc/src/**/__tests__/**/*.ts", "packages/crdt-doc/src/**/*.test.ts", "packages/document-model/src/**/__tests__/**/*.ts", "packages/document-model/src/**/*.test.ts", "packages/rivto-editor-core/src/**/__tests__/**/*.ts", "packages/rivto-editor-core/src/**/*.test.ts", "packages/react-rivto-editor/src/**/__tests__/**/*.ts", "packages/react-rivto-editor/src/**/*.test.ts"],
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);

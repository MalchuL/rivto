import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist", "demo/dist", "node_modules", "src/.stuff"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    },
  },
  {
    files: ["src/editor/**/*.ts", "src/editor/**/*.tsx", "src/store/document-model/**/*.ts"],
    ignores: ["src/**/__tests__/**"],
    rules: {
      "no-restricted-imports": ["error", {
        "paths": [{ "name": "yjs", "message": "Use CRDTDoc/CRDTMap/CRDTArray/CRDTText; native Yjs belongs only in the adapter." }]
      }],
    },
  },
  {
    files: ["src/**/__tests__/**/*.ts", "src/**/*.test.ts"],
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);

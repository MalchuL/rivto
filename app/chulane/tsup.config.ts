import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/client.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    "react",
    "react-dom",
    "react/jsx-runtime",
    "@chulane/rivto",
    "@chulane/rivto-react",
    "yjs",
  ],
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
});

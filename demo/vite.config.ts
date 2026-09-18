import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { reviewReportFilesPlugin } from "./review-report-files";

export default defineConfig({
  plugins: [
    // Compiles the editor's Tailwind source stylesheet (aliased below) so class
    // edits in packages/react-rivto-editor hot-reload without a package build.
    tailwindcss(),
    reviewReportFilesPlugin(fileURLToPath(new URL("../reports/", import.meta.url))),
  ],
  resolve: {
    // The demo is a workspace development consumer. Resolve package entry
    // points directly to source so editing core or React code never requires a
    // parallel package build/watch process. Published consumers still use each
    // package's normal dist exports.
    alias: [
      {
        find: "@chulane/rivto-react/styles.css",
        replacement: fileURLToPath(new URL("../packages/react-rivto-editor/src/styles/index.css", import.meta.url)),
      },
      {
        find: /^@chulane\/rivto-react$/,
        replacement: fileURLToPath(new URL("../packages/react-rivto-editor/src/index.ts", import.meta.url)),
      },
      {
        find: /^@chulane\/rivto$/,
        replacement: fileURLToPath(new URL("../packages/rivto-editor-core/src/index.ts", import.meta.url)),
      },
      {
        find: /^@chulane\/crdt-doc$/,
        replacement: fileURLToPath(new URL("../packages/crdt-doc/src/index.ts", import.meta.url)),
      },
      {
        find: /^@chulane\/document-model$/,
        replacement: fileURLToPath(new URL("../packages/document-model/src/index.ts", import.meta.url)),
      },
    ],
    // Source imports originate in two workspace packages. Force both to share
    // the demo's React runtime rather than following package-local symlinks.
    dedupe: ["react", "react-dom"],
  },
  server: {
    // Polling keeps `pnpm demo` usable on machines whose shared inotify watcher
    // limit is already exhausted by editors, browsers, or other dev servers.
    watch: { usePolling: true, interval: 300 },
  },
});

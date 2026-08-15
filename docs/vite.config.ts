/**
 * Configures the Rivto documentation development server and static build.
 * The Markdown plugin is the only server-side capability: it bundles pages for
 * static viewing and exposes guarded writes while Vite is running locally.
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { markdownFilesPlugin } from "./vite/markdown-files";

export default defineConfig({
  plugins: [react(), markdownFilesPlugin()],
  server: {
    watch: { usePolling: true, interval: 300 },
  },
});

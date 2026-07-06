import { defineConfig } from "vite";

export default defineConfig({
  server: {
    // Polling keeps `pnpm demo` usable on machines whose shared inotify watcher
    // limit is already exhausted by editors, browsers, or other dev servers.
    watch: { usePolling: true, interval: 300 },
  },
});

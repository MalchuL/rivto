import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        demo: fileURLToPath(new URL("./index.html", import.meta.url)),
        layoutInput: fileURLToPath(new URL("./__tests__/layout-input.html", import.meta.url)),
      },
    },
  },
});

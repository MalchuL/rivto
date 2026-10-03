/**
 * Runs the Chulane startup checks in a real browser and Electron window.
 * The browser uses an isolated development port; Electron owns a separate
 * local server, so its lifecycle is exercised independently of this fixture.
 */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  timeout: 60_000,
  use: { baseURL: "http://127.0.0.1:3017" },
  webServer: {
    command: "pnpm dev --port 3017",
    url: "http://127.0.0.1:3017",
    timeout: 60_000,
  },
});

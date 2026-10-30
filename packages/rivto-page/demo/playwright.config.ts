import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5184";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  fullyParallel: true,
  outputDir: "../../../test-results/rivto-page",
  reporter: "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "pnpm --config.verify-deps-before-run=false demo:preview",
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        url: baseURL,
        reuseExistingServer: false,
      },
});

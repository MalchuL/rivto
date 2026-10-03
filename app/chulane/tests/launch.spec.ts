/**
 * Verifies that one Next.js application opens in the browser and Electron.
 * Desktop checks use a temporary profile and confirm that closing Electron
 * also stops its server, preserving isolation from normal application data.
 */
import { _electron, expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const applicationPath = fileURLToPath(new URL("..", import.meta.url));

/**
 * Opens the web entry point and checks its application identity.
 * @param fixtures - Playwright's isolated browser page.
 * @returns Resolves when the shared screen is visible.
 */
test("opens Chulane in the browser", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Chulane");
  await expect(page.getByRole("heading", { name: "Chulane", exact: true })).toBeVisible();
});

for (const mode of ["development", "production"]) {
  /**
   * Starts Electron without an external server and verifies startup and cleanup.
   * @returns Resolves after the desktop window and its server have closed.
   */
  test(`opens Chulane in Electron (${mode}) and stops its local server on exit`, async () => {
    const profile = await mkdtemp(join(tmpdir(), "chulane-launch-"));
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && key !== "ELECTRON_RUN_AS_NODE") env[key] = value;
    }
    const desktop = await _electron.launch({
      executablePath: require("electron"),
      args: [applicationPath, ...(mode === "development" ? ["--development"] : []), `--user-data-dir=${profile}`],
      env,
    });
    let serverUrl = "";
    try {
      const page = await desktop.firstWindow();
      await page.waitForLoadState("load");
      await expect(page).toHaveTitle("Chulane");
      await expect(page.getByRole("heading", { name: "Chulane", exact: true })).toBeVisible();
      serverUrl = page.url();
      expect(new URL(serverUrl).hostname).toBe("127.0.0.1");
      await page.reload();
      await expect(page.getByRole("heading", { name: "Chulane", exact: true })).toBeVisible();
    } finally {
      await desktop.close();
      await rm(profile, { recursive: true, force: true });
    }
    /**
     * Confirms the desktop-owned HTTP server no longer accepts requests.
     * @returns Whether the server has stopped.
     */
    await expect.poll(async () => {
      let stopped = false;
      try {
        await fetch(serverUrl, { signal: AbortSignal.timeout(500) });
      } catch {
        stopped = true;
      }
      return stopped;
    }).toBe(true);
  });
}

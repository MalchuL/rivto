/**
 * Verifies that one Next.js application opens in the browser and Electron.
 * Desktop checks use a temporary profile and confirm that closing Electron
 * also stops its server, preserving isolation from normal application data.
 */
import { _electron, expect, test, type Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { once } from "node:events";

const require = createRequire(import.meta.url);
const applicationPath = fileURLToPath(new URL("..", import.meta.url));

/**
 * Copies host environment settings without Electron's Node-only execution flag.
 * @returns Environment values suitable for launching the desktop application.
 */
function desktopEnvironment() {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== "ELECTRON_RUN_AS_NODE") env[key] = value;
  }
  return env;
}

/**
 * Checks that the shared starter uses compiled Tailwind and shadcn styles.
 * @param page - The browser or desktop renderer showing Chulane.
 * @returns Resolves when the accessible starter and themed control are styled.
 */
async function expectStyledStarter(page: Page) {
  await expect(page.getByRole("heading", { name: "Chulane", exact: true })).toBeVisible();
  const button = page.getByRole("button", { name: "Create a page", exact: true });
  await expect(button).toBeVisible();
  await expect(button).toBeDisabled();
  /**
   * Measures resolved styles so an unloaded stylesheet cannot pass the check.
   * @param element - The rendered starter button.
   * @returns The layout and theme values applied by the compiled stylesheet.
   */
  const styles = await button.evaluate((element) => {
    const view = element.ownerDocument.defaultView!;
    const style = view.getComputedStyle(element);
    return {
      height: element.getBoundingClientRect().height,
      radius: Number.parseFloat(style.borderTopLeftRadius),
      background: style.backgroundColor,
      bodyBackground: view.getComputedStyle(element.ownerDocument.body).backgroundColor,
      primary: view.getComputedStyle(element.ownerDocument.documentElement).getPropertyValue("--primary").trim(),
    };
  });
  expect(styles.height).toBeGreaterThanOrEqual(36);
  expect(styles.radius).toBeGreaterThan(0);
  expect(styles.primary).not.toBe("");
  expect(styles.background).not.toBe(styles.bodyBackground);
  expect(styles.background).not.toBe("rgba(0, 0, 0, 0)");
  await page.screenshot({ path: test.info().outputPath("starter.png") });
}

/**
 * Opens the web entry point and checks its application identity.
 * @param fixtures - Playwright's isolated browser page.
 * @returns Resolves when the shared screen is visible.
 */
test("opens Chulane in the browser", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Chulane");
  await expectStyledStarter(page);
});

/**
 * Verifies the production web host initializes and disposes its Cordis runtime.
 * @returns Resolves after a graceful signal shutdown closes the HTTP server.
 */
test("starts the web runtime and awaits cleanup on SIGTERM", async () => {
  const server = spawn(process.execPath, ["dist/src/runtime/server.js", "--port", "0"], {
    cwd: applicationPath,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "production" },
  });
  let output = "";
  /**
   * Captures host diagnostics and its bound loopback URL.
   * @param chunk - Output emitted by the isolated web host.
   * @returns No value.
   */
  function capture(chunk: Buffer) { output += chunk.toString(); }
  server.stdout.on("data", capture);
  server.stderr.on("data", capture);
  const exited = once(server, "exit");
  try {
    /**
     * Waits for startup while immediately surfacing unexpected host failure.
     * @returns The host's listening URL, once reported.
     */
    await expect.poll(() => {
      if (server.exitCode !== null) throw new Error(output);
      return output.match(/Chulane listening at (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
    }).toBeTruthy();
    const url = output.match(/Chulane listening at (http:\/\/127\.0\.0\.1:\d+)/)![1];
    expect(output).toContain("Chulane runtime ready.");
    expect((await fetch(url)).status).toBe(200);
    server.kill("SIGTERM");
    expect(await exited).toEqual([0, null]);
    expect(output).toContain("Chulane runtime stopped.");
  } finally {
    if (server.exitCode === null) {
      server.kill("SIGKILL");
      await exited;
    }
  }
});

for (const mode of ["development", "production"]) {
  /**
   * Starts Electron without an external server and verifies startup and cleanup.
   * @returns Resolves after the desktop window and its server have closed.
   */
  test(`opens Chulane in Electron (${mode}) and stops its local server on exit`, async () => {
    const profile = await mkdtemp(join(tmpdir(), "chulane-launch-"));
    const desktop = await _electron.launch({
      executablePath: require("electron"),
      args: [applicationPath, ...(mode === "development" ? ["--development"] : []), `--user-data-dir=${profile}`],
      env: desktopEnvironment(),
    });
    let output = "";
    /**
     * Captures the desktop-owned runtime's cleanup acknowledgment.
     * @param chunk - Diagnostics forwarded by the utility process.
     * @returns No value.
     */
    desktop.process().stdout!.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    let serverUrl = "";
    try {
      const page = await desktop.firstWindow();
      await page.waitForLoadState("load");
      await expect(page).toHaveTitle("Chulane");
      await expectStyledStarter(page);
      serverUrl = page.url();
      expect(new URL(serverUrl).hostname).toBe("127.0.0.1");
      await page.reload();
      await expectStyledStarter(page);
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
    expect(output).toContain("Chulane runtime stopped.");
  });
}

/**
 * Verifies that a quit request during startup cannot create a late window.
 * @returns Resolves when desktop startup cancellation exits successfully.
 */
test("quits Electron during runtime startup without opening a late window", async () => {
  const profile = await mkdtemp(join(tmpdir(), "chulane-startup-"));
  const desktop = await _electron.launch({
    executablePath: require("electron"),
    args: [applicationPath, "--development", `--user-data-dir=${profile}`],
    env: desktopEnvironment(),
  });
  const processHandle = desktop.process();
  let windows = 0;
  /**
   * Records any window created after the launch handshake and quit request.
   * @returns No value.
   */
  desktop.on("window", () => { windows += 1; });
  try {
    await desktop.close();
    expect(processHandle.exitCode).toBe(0);
    expect(windows).toBe(0);
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
});

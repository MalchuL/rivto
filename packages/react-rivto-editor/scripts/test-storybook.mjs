import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const port = 6006;
const url = `http://127.0.0.1:${port}`;
const browsers = process.env.TEST_BROWSERS ?? "chromium,firefox";

const storybook = spawn(
  "pnpm",
  ["exec", "storybook", "dev", "--port", String(port), "--host", "127.0.0.1", "--ci"],
  { cwd: packageRoot, stdio: "inherit" },
);

/**
 * Polls Storybook until its story index responds.
 *
 * @returns Nothing once `/index.json` is available.
 * @throws When the dev server does not become ready in time.
 */
async function waitUntilReady() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const response = await fetch(`${url}/index.json`);
      if (response.ok) {
        return;
      }
    } catch {
      // The dev server is still starting.
    }
    await delay(1000);
  }
  throw new Error("Storybook did not become ready");
}

/**
 * Stops the Storybook process started for this test run.
 *
 * @returns Nothing after the termination signal is sent.
 */
function stopStorybook() {
  storybook.kill("SIGTERM");
}

try {
  await waitUntilReady();
  const test = spawn(
    "pnpm",
    [
      "exec",
      "test-storybook",
      "--url",
      url,
      "--maxWorkers",
      "1",
      "--testTimeout",
      "60000",
    ],
    {
      cwd: packageRoot,
      stdio: "inherit",
      env: { ...process.env, TEST_BROWSERS: browsers },
    },
  );
  const code = await new Promise((resolve) => {
    test.on("exit", resolve);
  });
  stopStorybook();
  process.exit(typeof code === "number" ? code : 1);
} catch (error) {
  stopStorybook();
  console.error(error);
  process.exit(1);
}

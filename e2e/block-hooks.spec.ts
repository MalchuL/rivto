import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

let output: string;

test.beforeAll(async () => {
  const require = createRequire(resolve("demo/package.json"));
  const { build } = await import(pathToFileURL(require.resolve("vite")).href);
  output = await mkdtemp(join(tmpdir(), "rivto-block-hooks-"));
  await build({
    root: resolve("demo"),
    configFile: resolve("demo/vite.config.ts"),
    logLevel: "error",
    define: { "process.env.NODE_ENV": '"production"' },
    build: {
      outDir: output,
      lib: { entry: resolve("e2e/fixtures/block-hooks.tsx"), name: "RivtoHookTests", formats: ["iife"], fileName: () => "hooks.js" },
    },
  });
});

test.afterAll(async () => { if (output) await rm(output, { recursive: true, force: true }); });

test("block hooks bind commands, release subscriptions, and synchronize replaced DOM and IME", async ({ page }) => {
  await page.route("**/block-hooks", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Block hooks</title>" }));
  await page.goto("/block-hooks");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addScriptTag({ path: join(output, "hooks.js") });
  expect(errors).toEqual([]);
  await expect(page.evaluate(async () => {
    await (window as unknown as { RivtoHookTests: { run(): Promise<void> } }).RivtoHookTests.run();
    return "passed";
  })).resolves.toBe("passed");
});

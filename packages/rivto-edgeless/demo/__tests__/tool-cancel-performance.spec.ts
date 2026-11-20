import { expect, test, type Page } from "@playwright/test";

test("cancels an active tool in a 10,000-element canvas", async ({ page }) => {
  await page.goto("/");
  const toolbar = page.getByRole("toolbar", { name: "Canvas tools", exact: true });
  await toolbar.getByRole("button", { name: "Shapes", exact: true }).click();
  const viewport = page.getByRole("main", { name: "Independent canvas" });
  await expect(page.getByLabel("Tool capture")).toBeVisible();
  const samples = [];
  for (let index = 0; index < 3; index++) {
    const area = (await viewport.boundingBox())!;
    await page.mouse.move(area.x + 650, area.y + 180);
    await page.mouse.down();
    await page.mouse.move(area.x + 740, area.y + 250, { steps: 4 });
    await expect(page.locator("[data-demo-creation-preview]")).toBeVisible();
    samples.push(await measureCancel(page));
    await page.mouse.up();
    await expect(page.locator("[data-demo-creation-preview]")).toHaveCount(0);
    await expect(page.getByLabel("Committed gestures")).toHaveText("0");
  }
  console.log(JSON.stringify({ interaction: "canvas-tool-cancel", elements: 10000, samples }));
});

/**
 * Measures Escape delivery and the following two rendering frames.
 *
 * @param page - Warm canvas demo with an active creation gesture.
 * @returns Synchronous and two-frame timings in milliseconds.
 */
async function measureCancel(page: Page): Promise<unknown> {
  await page.evaluate(() => {
    const state = window as unknown as { toolCancelTiming: unknown };
    state.toolCancelTiming = null;
    window.addEventListener(
      "keydown",
      () => {
        const start = performance.now();
        window.addEventListener(
          "keydown",
          () => {
            const sync = performance.now() - start;
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                state.toolCancelTiming = { sync, frames: performance.now() - start };
              }),
            );
          },
          { once: true },
        );
      },
      { capture: true, once: true },
    );
  });
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => (window as unknown as { toolCancelTiming: unknown }).toolCancelTiming,
  );
  return page.evaluate(() => (window as unknown as { toolCancelTiming: unknown }).toolCancelTiming);
}

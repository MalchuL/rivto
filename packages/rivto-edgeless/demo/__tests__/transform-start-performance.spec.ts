import { expect, test, type Page } from "@playwright/test";

test("starts and cancels a transform in a 10,000-element canvas", async ({ page }) => {
  await page.goto("/");
  const item = page.locator('[data-canvas-element="0"]');
  const initial = (await item.boundingBox())!;
  const samples = [];
  for (let index = 0; index < 3; index++) {
    await page.mouse.move(initial.x + 50, initial.y + 40);
    samples.push(await measureStart(page));
    await page.mouse.move(initial.x + 130, initial.y + 90, { steps: 4 });
    expect((await item.boundingBox())!.x).toBeGreaterThan(initial.x);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    expect((await item.boundingBox())!.x).toBeCloseTo(initial.x, 0);
    await expect(page.getByLabel("Committed gestures")).toHaveText("0");
  }
  console.log(JSON.stringify({ interaction: "canvas-transform-start", elements: 10000, samples }));
});

/**
 * Measures a real mouse press and the following two rendering frames.
 *
 * @param page - Warm canvas demo with an eligible movable item.
 * @returns Synchronous and two-frame timings in milliseconds.
 */
async function measureStart(page: Page): Promise<unknown> {
  await page.evaluate(() => {
    const state = window as unknown as { transformStartTiming: unknown };
    state.transformStartTiming = null;
    window.addEventListener(
      "mousedown",
      () => {
        const start = performance.now();
        window.addEventListener(
          "mousedown",
          () => {
            const sync = performance.now() - start;
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                state.transformStartTiming = { sync, frames: performance.now() - start };
              }),
            );
          },
          { once: true },
        );
      },
      { capture: true, once: true },
    );
  });
  await page.mouse.down();
  await page.waitForFunction(
    () => (window as unknown as { transformStartTiming: unknown }).transformStartTiming,
  );
  return page.evaluate(
    () => (window as unknown as { transformStartTiming: unknown }).transformStartTiming,
  );
}

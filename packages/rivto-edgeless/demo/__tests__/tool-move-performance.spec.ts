import { expect, test, type Page } from "@playwright/test";

test("updates a creation preview in a 10,000-element canvas", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("toolbar", { name: "Canvas tools" })
    .getByRole("button", { name: "Shapes" })
    .click();
  await expect(page.getByLabel("Tool capture")).toBeVisible();
  const area = (await page.getByRole("main", { name: "Independent canvas" }).boundingBox())!;
  const samples = [];
  for (let index = 0; index < 3; index++) {
    await page.mouse.move(area.x + 650, area.y + 180);
    await page.mouse.down();
    samples.push(await measureMove(page, area.x + 740, area.y + 250));
    await expect(page.locator("[data-demo-creation-preview]")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.locator("[data-demo-creation-preview]")).toHaveCount(0);
    await expect(page.getByLabel("Committed gestures")).toHaveText("0");
  }
  console.log(JSON.stringify({ interaction: "canvas-tool-move", elements: 10000, samples }));
});

/**
 * Measures a real pointer move and the following two rendering frames.
 *
 * @param page - Warm canvas demo with a captured creation gesture.
 * @param x - Destination viewport X coordinate in CSS pixels.
 * @param y - Destination viewport Y coordinate in CSS pixels.
 * @returns Synchronous and two-frame timings in milliseconds.
 */
async function measureMove(page: Page, x: number, y: number): Promise<unknown> {
  await page.evaluate(() => {
    const state = window as unknown as { toolMoveTiming: unknown };
    state.toolMoveTiming = null;
    window.addEventListener(
      "pointermove",
      () => {
        const start = performance.now();
        window.addEventListener(
          "pointermove",
          () => {
            const sync = performance.now() - start;
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                state.toolMoveTiming = { sync, frames: performance.now() - start };
              }),
            );
          },
          { once: true },
        );
      },
      { capture: true, once: true },
    );
  });
  await page.mouse.move(x, y);
  await page.waitForFunction(
    () => (window as unknown as { toolMoveTiming: unknown }).toolMoveTiming,
  );
  return page.evaluate(() => (window as unknown as { toolMoveTiming: unknown }).toolMoveTiming);
}

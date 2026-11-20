import { expect, test, type Page } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`cancels a Bento resize, repeat=${repeat}`, async ({ page, browserName }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    const board = page.locator('[data-block-type="bento"]').first();
    await board.getByRole("button", { name: "Expand Bento", exact: true }).click();
    const tile = board.locator(":scope > .rivto-block-children > .rivto-bento-tile").first();
    const handle = tile.getByRole("separator", { name: "Resize Bento tile from the right" });
    const samples = [];
    const cancellations = [];
    for (let index = 0; index < 3; index++) {
      await tile.hover();
      const bounds = (await handle.boundingBox())!;
      const x = bounds.x + bounds.width / 2;
      const y = bounds.y + bounds.height / 2;
      await page.mouse.move(x, y);
      await armCancelMeasurement(page);
      await page.mouse.down();
      samples.push(await measureResize(page, x + 50, y));
      await expect(tile).toHaveAttribute("data-bento-resizing", "right");
      cancellations.push(await measureCancel(page));
      await page.mouse.up();
      await expect(tile).not.toHaveAttribute("data-bento-resizing");
    }
    console.log(
      JSON.stringify({ interaction: "bento-resize", browserName, repeat, samples, cancellations }),
    );
  });
}

/**
 * Installs the start timestamp before the resize owns its Escape listener.
 *
 * @param page - Warm demo before pointer capture begins.
 * @returns The next keydown will record its capture-phase start time.
 */
async function armCancelMeasurement(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = window as unknown as { bentoCancelStart: number; bentoCancelTiming: unknown };
    state.bentoCancelTiming = null;
    window.addEventListener("keydown", () => (state.bentoCancelStart = performance.now()), {
      capture: true,
      once: true,
    });
  });
}

/**
 * Measures Escape after the resize has installed its capture listener.
 *
 * @param page - Warm demo with an active resize gesture.
 * @returns Synchronous listener and two-frame durations in milliseconds.
 */
async function measureCancel(page: Page): Promise<unknown> {
  await page.evaluate(() => {
    const state = window as unknown as { bentoCancelStart: number; bentoCancelTiming: unknown };
    window.addEventListener(
      "keydown",
      () => {
        const sync = performance.now() - state.bentoCancelStart;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            state.bentoCancelTiming = { sync, frames: performance.now() - state.bentoCancelStart };
          });
        });
      },
      { capture: true, once: true },
    );
  });
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => (window as unknown as { bentoCancelTiming: unknown }).bentoCancelTiming,
  );
  return page.evaluate(
    () => (window as unknown as { bentoCancelTiming: unknown }).bentoCancelTiming,
  );
}

/**
 * Measures one real pointer movement and the next two animation frames.
 *
 * @param page - Warm demo with an active resize gesture.
 * @param x - Pointer client X coordinate in CSS pixels.
 * @param y - Pointer client Y coordinate in CSS pixels.
 * @returns Synchronous listener and two-frame durations in milliseconds.
 */
async function measureResize(page: Page, x: number, y: number): Promise<unknown> {
  await page.evaluate(() => {
    const state = window as unknown as { bentoResizeTiming: unknown };
    state.bentoResizeTiming = null;
    let start = 0;
    window.addEventListener(
      "pointermove",
      () => {
        start = performance.now();
      },
      { capture: true, once: true },
    );
    window.addEventListener(
      "pointermove",
      () => {
        const sync = performance.now() - start;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            state.bentoResizeTiming = { sync, frames: performance.now() - start };
          });
        });
      },
      { once: true },
    );
  });
  await page.mouse.move(x, y);
  await page.waitForFunction(
    () => (window as unknown as { bentoResizeTiming: unknown }).bentoResizeTiming,
  );
  return page.evaluate(
    () => (window as unknown as { bentoResizeTiming: unknown }).bentoResizeTiming,
  );
}

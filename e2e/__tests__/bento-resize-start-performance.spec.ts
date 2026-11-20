import { expect, test, type Locator } from "@playwright/test";
import type { BentoResizeStartWindow } from "./types";

for (const repeat of [0, 200]) {
  test(`starts a Bento resize, repeat=${repeat} @performance`, async ({ page, browserName }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    const board = page.locator('[data-block-type="bento"]').first();
    await board.getByRole("button", { name: "Expand Bento", exact: true }).click();
    const tile = board.locator(":scope > .rivto-block-children > .rivto-bento-tile").first();
    const handle = tile.getByRole("separator", { name: "Resize Bento tile from the right" });
    const samples = [];
    for (let index = 0; index < 3; index++) {
      await tile.hover();
      const bounds = (await handle.boundingBox())!;
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await armBentoResizeStart(handle);
      await page.mouse.down();
      await expect(tile).toHaveAttribute("data-bento-resizing", "right");
      await page.waitForFunction(
        () => (window as unknown as BentoResizeStartWindow).bentoStartTiming,
      );
      samples.push(
        await page.evaluate(() => (window as unknown as BentoResizeStartWindow).bentoStartTiming),
      );
      await page.keyboard.press("Escape");
      await page.mouse.up();
      await expect(tile).not.toHaveAttribute("data-bento-resizing");
    }
    console.log(
      JSON.stringify({ interaction: "bento-resize-start", browserName, repeat, samples }),
    );
  });
}

/**
 * Measures pointer-down delivery through the resize handle and two browser frames.
 *
 * @param handle - Mounted Bento resize separator receiving the next pointer press.
 * @returns Timing listeners are installed for one pointer-down delivery.
 */
async function armBentoResizeStart(handle: Locator): Promise<void> {
  await handle.evaluate((element) => {
    const state = window as unknown as BentoResizeStartWindow;
    state.bentoStartTiming = null;
    let start = 0;
    window.addEventListener(
      "pointerdown",
      () => {
        start = performance.now();
      },
      { capture: true, once: true },
    );
    element.addEventListener(
      "pointerdown",
      () => {
        const sync = performance.now() - start;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            state.bentoStartTiming = { sync, frames: performance.now() - start };
          }),
        );
      },
      { once: true },
    );
  });
}

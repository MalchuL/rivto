import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";
import { ROOT_BLOCK_SELECTOR } from "../dom-markers";

for (const repeat of [0, 200]) {
  test(`moves a block through a root gap, repeat=${repeat}`, async ({ page, browserName }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(`/?repeat=${repeat}`);
    const surface = page.locator('[data-journal-document="today"] > .page-surface');
    const roots = surface.locator(ROOT_BLOCK_SELECTOR);
    await expect(roots.nth(2)).toBeVisible();
    const ids = await roots.evaluateAll((elements) =>
      elements.slice(0, 3).map((element) => element.getAttribute("data-block-id")!),
    );
    expect(ids).toHaveLength(3);
    const source = surface.locator(`[data-block-id="${ids[0]}"]`).first();
    const previous = surface.locator(`[data-block-id="${ids[1]}"]`).first();
    const next = surface.locator(`[data-block-id="${ids[2]}"]`).first();
    const samples = [];
    for (let index = 0; index < 3; index++) {
      await source.locator(":scope > .rivto-block-row").hover();
      const handle = (await source.locator(".block-handle").first().boundingBox())!;
      const before = (await previous.boundingBox())!;
      const after = (await next.boundingBox())!;
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
      await page.mouse.down();
      samples.push(
        await measureGapMovement(page, before.x + 6, (before.y + before.height + after.y) / 2),
      );
      await expect(page.locator(".rivto-block-drop-line:visible")).toBeVisible();
      await page.mouse.up();
      await expect
        .poll(() =>
          page.evaluate(() =>
            (window.__rivtoDemo.editor as DocumentEditorAPI).blocks.getRootIds().slice(0, 3),
          ),
        )
        .toEqual([ids[1], ids[0], ids[2]]);
      await page.keyboard.press("ControlOrMeta+z");
      await expect
        .poll(() =>
          page.evaluate(() =>
            (window.__rivtoDemo.editor as DocumentEditorAPI).blocks.getRootIds().slice(0, 3),
          ),
        )
        .toEqual(ids);
    }
    console.log(
      JSON.stringify({ interaction: "page-gap-resolution", browserName, repeat, samples }),
    );
  });
}

/**
 * Measures a real pointer movement into the gap and its following two frames.
 *
 * @param page - Warm demo with the source pointer already held.
 * @param x - Gap client X coordinate in CSS pixels.
 * @param y - Gap client Y coordinate in CSS pixels.
 * @returns Synchronous event and two-frame timing for the movement.
 */
async function measureGapMovement(page: Page, x: number, y: number): Promise<unknown> {
  await page.evaluate(() => {
    const state = window as unknown as { gapTiming: unknown };
    state.gapTiming = null;
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
                state.gapTiming = { sync, frames: performance.now() - start };
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
  await page.waitForFunction(() => (window as unknown as { gapTiming: unknown }).gapTiming);
  return page.evaluate(() => (window as unknown as { gapTiming: unknown }).gapTiming);
}

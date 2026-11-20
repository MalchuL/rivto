import { expect, test, type Page } from "@playwright/test";
import { blockDropRegion, type DropRegionBox } from "../drop-regions";
import type { PageHandleDragTiming, PageHandleDragWindow } from "./types";

for (const mode of ["block", "edgeless"] as const) {
  for (const repeat of [0, 200]) {
    test(`moves a block by its handle in ${mode}, repeat=${repeat}`, async ({ page }) => {
      await page.setViewportSize({ width: 1400, height: 1000 });
      await page.goto(`/?repeat=${repeat}`);
      if (mode === "edgeless") {
        await page.locator('[data-editor-mode="edgeless"]').click();
      }
      const source = page
        .locator("[data-block-id]")
        .filter({ hasText: "This paragraph renders" })
        .first();
      const target = page
        .locator("[data-block-id]")
        .filter({ hasText: "**Rivto editor**" })
        .first();
      const sourceId = await source.getAttribute("data-block-id");
      const targetId = await target.getAttribute("data-block-id");
      expect(await isBefore(page, targetId, sourceId)).toBe(true);
      await source.locator(":scope > .rivto-block-row").hover();
      const handle = source.locator(".block-handle").first();
      const sourceBox = await handle.boundingBox();
      const targetBox = await (await blockDropRegion(target, "before")).boundingBox();
      expect(sourceBox).not.toBeNull();
      await page.mouse.move(
        sourceBox!.x + sourceBox!.width / 2,
        sourceBox!.y + sourceBox!.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
      await expect(page.locator(".rivto-block-drop-line:visible")).toHaveCount(1);
      const samples = await measureDragSamples(page, targetBox);
      await page.mouse.up();
      await expect.poll(() => isBefore(page, sourceId, targetId)).toBe(true);
      await expect(page.locator(".rivto-block-drag-preview")).toHaveCount(0);
      console.log(JSON.stringify({ interaction: "page-handle-drag", mode, repeat, samples }));
    });
  }
}

/**
 * Measures three real pointer moves while the drag remains active.
 *
 * @param page - Warm demo receiving the active drag.
 * @param targetBox - Viewport rectangle of the destination boundary.
 * @returns Synchronous and two-frame timings for each move.
 */
async function measureDragSamples(
  page: Page,
  targetBox: DropRegionBox,
): Promise<PageHandleDragTiming[]> {
  const samples: PageHandleDragTiming[] = [];
  for (const offset of [1, -1, 1]) {
    await page.evaluate(() => {
      const state = window as PageHandleDragWindow;
      state.dragRegistrationTiming = undefined;
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
                  state.dragRegistrationTiming = { sync, frames: performance.now() - start };
                }),
              );
            },
            { once: true },
          );
        },
        { capture: true, once: true },
      );
    });
    await page.mouse.move(
      targetBox.x + targetBox.width / 2 + offset,
      targetBox.y + targetBox.height / 2,
    );
    await page.waitForFunction(() =>
      Boolean((window as PageHandleDragWindow).dragRegistrationTiming),
    );
    samples.push(
      await page.evaluate(() => (window as PageHandleDragWindow).dragRegistrationTiming!),
    );
  }
  return samples;
}

/**
 * Checks canonical root order without relying on the rendered feedback.
 *
 * @param page - Demo containing the document.
 * @param first - Block expected before the other block, or null if its DOM identity was missing.
 * @param second - Block expected after the first, or null if its DOM identity was missing.
 * @returns Whether both blocks exist and occur in the requested order.
 */
async function isBefore(page: Page, first: string | null, second: string | null): Promise<boolean> {
  return page.evaluate(
    ({ first, second }) => {
      const ids = (window as PageHandleDragWindow).__rivtoDemo.editor.blocks.getRootIds();
      return (
        first !== null &&
        second !== null &&
        ids.indexOf(first) >= 0 &&
        ids.indexOf(first) < ids.indexOf(second)
      );
    },
    { first, second },
  );
}

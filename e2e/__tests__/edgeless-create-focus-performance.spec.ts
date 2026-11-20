import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const repeat of [0, 200]) {
  test(`creates and focuses an edgeless card, repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
    await page.locator('[data-editor-mode="edgeless"]').click();
    const viewport = page.locator(".edgeless-viewport");
    await viewport.evaluate((element) => element.scrollIntoView({ block: "start" }));
    const cards = page.locator("[data-edgeless-root]");
    const originalCount = await cards.count();
    const samples = [];
    for (let index = 0; index < 3; index++) {
      const point = await emptyPoint(page);
      await page.evaluate(() => {
        const state = window as unknown as { cardTiming: unknown };
        state.cardTiming = null;
        window.addEventListener(
          "dblclick",
          () => {
            const start = performance.now();
            window.addEventListener(
              "dblclick",
              () => {
                const sync = performance.now() - start;
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => {
                    state.cardTiming = { sync, frames: performance.now() - start };
                  }),
                );
              },
              { once: true },
            );
          },
          { capture: true, once: true },
        );
      });
      await page.mouse.dblclick(point.x, point.y);
      await page.waitForFunction(() => (window as unknown as { cardTiming: unknown }).cardTiming);
      samples.push(
        await page.evaluate(() => (window as unknown as { cardTiming: unknown }).cardTiming),
      );
      await expect(cards).toHaveCount(originalCount + 1);
      const id = await page.evaluate(
        () =>
          (
            window as unknown as {
              __rivtoDemo: { editor: DocumentEditorAPI };
            }
          ).__rivtoDemo.editor.selection.get()?.focusBlockId,
      );
      expect(id).toBeTruthy();
      await expect(page.locator(`[data-block-id="${id}"] [data-block-content]`)).toBeFocused();
      await page.keyboard.press("ControlOrMeta+z");
      await expect(cards).toHaveCount(originalCount);
    }
    console.log(JSON.stringify({ interaction: "edgeless-create-focus", repeat, samples }));
  });
}

/**
 * Finds a visible canvas point outside existing objects and controls.
 *
 * @param page - Demo displaying its edgeless viewport.
 * @returns Screen coordinates accepted by the viewport double-click handler.
 * @throws If the viewport has no visible empty point.
 */
async function emptyPoint(page: Page): Promise<{ x: number; y: number }> {
  return page.locator(".edgeless-viewport").evaluate((viewport) => {
    const rect = viewport.getBoundingClientRect();
    for (let y = rect.bottom - 100; y > rect.top + 100; y -= 40) {
      for (let x = rect.right - 110; x > rect.left + 110; x -= 40) {
        const hit = document.elementFromPoint(x, y);
        if (
          hit &&
          viewport.contains(hit) &&
          !hit.closest("[data-edgeless-root], [data-edgeless-object-kind], [data-edgeless-ui]")
        ) {
          return { x, y };
        }
      }
    }
    throw new Error("Expected an empty canvas point");
  });
}

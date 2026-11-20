import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const repeat of [0, 200]) {
  test(`toolbar placement shows and removes alignment guides, repeat=${repeat}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    await page.locator('[data-editor-mode="edgeless"]').click();
    const id = await page.evaluate(() => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      return editor.elements.insertElement({
        type: "rectangle",
        frame: { x: 500, y: 200, width: 160, height: 100 },
        zIndex: 10000,
      }).id;
    });
    const target = (await page.locator(`[data-edgeless-object-id="${id}"]`).boundingBox())!;
    const rectangles = page.locator('[data-edgeless-visual-kind="rectangle"]');
    const count = await rectangles.count();
    const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
    await toolbar.getByRole("button", { name: "Shapes", exact: true }).click();
    const button = toolbar.getByRole("button", { name: "Rectangle", exact: true });
    const origin = (await button.boundingBox())!;
    await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x - 80, target.y + 50, { steps: 8 });
    await expect(page.locator('[data-edgeless-snap-guide="align"]').first()).toBeVisible();
    const samples = [];
    for (const offset of [1, 2, 3]) {
      samples.push(await measureMove(page, target.x - 80 + offset, target.y + 50));
      await expect(page.locator('[data-edgeless-snap-guide="align"]').first()).toBeVisible();
    }
    console.log(JSON.stringify({ interaction: "toolbar-snap-guides", repeat, samples }));
    await page.mouse.up();
    await expect(page.locator("[data-edgeless-snap-guide]")).toHaveCount(0);
    await expect(rectangles).toHaveCount(count + 1);
  });
}

/**
 * Times a real drag movement and the following two animation frames.
 *
 * @param page - Warm demo with a captured toolbar drag.
 * @param x - Horizontal client position in CSS pixels.
 * @param y - Vertical client position in CSS pixels.
 * @returns Event duration and two-frame rendering proxy in milliseconds.
 */
async function measureMove(page: Page, x: number, y: number) {
  await page.evaluate(() => {
    const state = window as unknown as { guideTiming: null | { sync: number; frames: number } };
    state.guideTiming = null;
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
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            state.guideTiming = { sync, frames: performance.now() - start };
          }),
        );
      },
      { once: true },
    );
  });
  await page.mouse.move(x, y);
  await page.waitForFunction(
    () => (window as unknown as { guideTiming: unknown }).guideTiming !== null,
  );
  return page.evaluate(
    () => (window as unknown as { guideTiming: { sync: number; frames: number } }).guideTiming,
  );
}

import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const mode of ["block", "edgeless"] as const) {
  for (const repeat of [0, 200]) {
    test(`toggles block selection in ${mode}, repeat=${repeat}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto(`/?repeat=${repeat}`);
      const today = page.locator('[data-journal-document="today"]');
      await today.locator("[data-block-content]").first().waitFor();
      await today.locator(`[data-editor-mode="${mode}"]`).click();
      const target = today
        .locator("[data-block-content]")
        .filter({ hasText: /^Finish the selection/ })
        .first();
      if (mode === "edgeless") {
        const cardId = await target.evaluate(
          (element) => element.closest<HTMLElement>("[data-edgeless-root]")!.dataset.edgelessRoot!,
        );
        await page.evaluate(
          (id) =>
            (
              window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
            ).__rivtoDemo.editor.elements.updateElement(id, { zIndex: 1000 }),
          cardId,
        );
      }
      const blockId = await target.evaluate((element) =>
        element.closest("[data-block-id]")!.getAttribute("data-block-id")!,
      );
      const readIds = () =>
        page.evaluate(
          () =>
            (
              window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
            ).__rivtoDemo.editor.selection
              .get()
              ?.blocks.map((block) => block.id) ?? [],
        );
      const samples = [];
      for (let index = 0; index < 3; index++) {
        await page.keyboard.down("Control");
        await startTiming(page);
        await target.click();
        await page.waitForFunction(
          () => (window as unknown as { toggleTiming: unknown }).toggleTiming,
        );
        samples.push(
          await page.evaluate(() => (window as unknown as { toggleTiming: unknown }).toggleTiming),
        );
        await expect.poll(readIds).toContain(blockId);
        await target.click();
        await expect.poll(readIds).not.toContain(blockId);
        await page.keyboard.up("Control");
      }
      console.log(JSON.stringify({ interaction: "page-toggle-selection", mode, repeat, samples }));
    });
  }
}

/**
 * Measures the next real pointer delivery and two subsequent animation frames.
 *
 * @param page - Warm editor awaiting the modifier click.
 * @returns A one-shot listener stores both durations on the page.
 */
async function startTiming(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = window as unknown as { toggleTiming: unknown };
    state.toggleTiming = null;
    window.addEventListener(
      "pointerdown",
      () => {
        const start = performance.now();
        window.addEventListener(
          "pointerdown",
          () => {
            const sync = performance.now() - start;
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                state.toggleTiming = { sync, frames: performance.now() - start };
              }),
            );
          },
          { once: true },
        );
      },
      { capture: true, once: true },
    );
  });
}

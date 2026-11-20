import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const mode of ["block", "edgeless"] as const) {
  for (const repeat of [0, 200]) {
    test(`splits a block and focuses the new caret in ${mode}, repeat=${repeat}`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await page.goto(`/?repeat=${repeat}`);
      const today = page.locator('[data-journal-document="today"]');
      await today.locator("[data-block-content]").first().waitFor();
      await today.locator(`[data-editor-mode="${mode}"]`).click();
      const content = today
        .locator("[data-block-content]")
        .filter({ hasText: /^Finish the selection/ })
        .first();
      const id = await content.evaluate((element) =>
        element.closest("[data-block-id]")!.getAttribute("data-block-id")!,
      );
      if (mode === "edgeless") {
        const cardId = await content.evaluate(
          (element) => element.closest<HTMLElement>("[data-edgeless-root]")!.dataset.edgelessRoot!,
        );
        await page.evaluate(
          (value) => window.__rivtoDemo.editor.elements.updateElement(value, { zIndex: 1000 }),
          cardId,
        );
      }
      const samples = [];
      for (let index = 0; index < 3; index++) {
        await content.click();
        await page.keyboard.press("End");
        samples.push(await measureSplit(page));
        const newId = await page.evaluate(
          () =>
            (
              window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
            ).__rivtoDemo.editor.selection.get()?.focusBlockId,
        );
        expect(newId).toBeTruthy();
        expect(newId).not.toBe(id);
        await expect(
          today.locator(`[data-block-id="${newId}"] [data-block-content]`),
        ).toBeFocused();
        await page.keyboard.press("ControlOrMeta+z");
        await expect(today.locator(`[data-block-id="${newId}"]`)).toHaveCount(0);
      }
      console.log(JSON.stringify({ interaction: "block-split-focus", mode, repeat, samples }));
    });
  }
}

/**
 * Measures Enter delivery and the following two browser frames.
 *
 * @param page - Warm editor with a caret at the end of the source block.
 * @returns Synchronous delivery and two-frame durations in milliseconds.
 */
async function measureSplit(page: Page): Promise<unknown> {
  await page.evaluate(() => {
    const state = window as unknown as { blockSplitTiming: unknown };
    state.blockSplitTiming = null;
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
                state.blockSplitTiming = { sync, frames: performance.now() - start };
              }),
            );
          },
          { once: true },
        );
      },
      { capture: true, once: true },
    );
  });
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => (window as unknown as { blockSplitTiming: unknown }).blockSplitTiming,
  );
  return page.evaluate(() => (window as unknown as { blockSplitTiming: unknown }).blockSplitTiming);
}

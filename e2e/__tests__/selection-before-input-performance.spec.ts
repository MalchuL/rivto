import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const mode of ["block", "edgeless"] as const) {
  for (const repeat of [0, 200]) {
    test(`captures a caret before typing in ${mode}, repeat=${repeat}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto(`/?repeat=${repeat}`);
      if (mode === "edgeless") {
        await page.locator('[data-editor-mode="edgeless"]').click();
      }
      const surface = page
        .locator(mode === "block" ? ".page-surface" : ".edgeless-viewport")
        .first();
      const content = surface.locator("[data-block-content][contenteditable]").first();
      await expect(content).toBeVisible();
      const id = await content.evaluate((element) =>
        element.closest("[data-block-id]")!.getAttribute("data-block-id")!,
      );
      await content.click();
      await page.keyboard.press("End");
      const original = await readContent(page, id);
      const samples = [];
      for (let index = 0; index < 3; index++) {
        samples.push(await measureInput(page));
        await expect.poll(() => readContent(page, id)).toBe(`${original}x`);
        await expect(content).toBeFocused();
        await page.keyboard.press("Backspace");
        await expect.poll(() => readContent(page, id)).toBe(original);
      }
      console.log(JSON.stringify({ interaction: "selection-before-input", mode, repeat, samples }));
    });
  }
}

/**
 * Reads the persisted text for the block being edited.
 *
 * @param page - Demo page retaining its editor.
 * @param id - Persisted block identity.
 * @returns Current block text, or undefined when missing.
 */
async function readContent(page: Page, id: string) {
  return page.evaluate(
    (blockId) =>
      (
        window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
      ).__rivtoDemo.editor.blocks.getBlockNode(blockId)?.content,
    id,
  );
}

/**
 * Types one character and measures the beforeinput event and two animation frames.
 *
 * @param page - Warm page with the intended editable caret focused.
 * @returns Synchronous browser delivery and two-frame durations in milliseconds.
 */
async function measureInput(page: Page) {
  await page.evaluate(() => {
    const state = window as unknown as { inputTiming: null | { sync: number; frames: number } };
    state.inputTiming = null;
    let start = 0;
    window.addEventListener(
      "beforeinput",
      () => {
        start = performance.now();
      },
      { capture: true, once: true },
    );
    window.addEventListener(
      "beforeinput",
      () => {
        const sync = performance.now() - start;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            state.inputTiming = { sync, frames: performance.now() - start };
          }),
        );
      },
      { once: true },
    );
  });
  await page.keyboard.type("x");
  await page.waitForFunction(
    () => (window as unknown as { inputTiming: unknown }).inputTiming !== null,
  );
  return page.evaluate(
    () => (window as unknown as { inputTiming: { sync: number; frames: number } }).inputTiming,
  );
}

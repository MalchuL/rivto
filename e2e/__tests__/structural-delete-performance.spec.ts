import { expect, test, type Page } from "@playwright/test";

for (const mode of ["block", "edgeless"] as const) {
  for (const repeat of [0, 200]) {
    test(`deletes a structurally selected block in ${mode}, repeat=${repeat}`, async ({ page }) => {
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
      const block = today.locator(`[data-block-id="${id}"]`);
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
        await content.click({ modifiers: ["Control"] });
        await expect(block).toHaveAttribute("data-block-selected", "true");
        samples.push(await measureDelete(page));
        await expect(block).toHaveCount(0);
        await page.keyboard.press("ControlOrMeta+z");
        await expect(content).toBeVisible();
      }
      console.log(JSON.stringify({ interaction: "structural-delete", mode, repeat, samples }));
    });
  }
}

/**
 * Measures a Delete key delivery and its following two browser frames.
 *
 * @param page - Warm editor with one structurally selected block.
 * @returns Synchronous delivery and two-frame durations in milliseconds.
 */
async function measureDelete(page: Page): Promise<unknown> {
  await page.evaluate(() => {
    const state = window as unknown as { structuralDeleteTiming: unknown };
    state.structuralDeleteTiming = null;
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
                state.structuralDeleteTiming = { sync, frames: performance.now() - start };
              }),
            );
          },
          { once: true },
        );
      },
      { capture: true, once: true },
    );
  });
  await page.keyboard.press("Delete");
  await page.waitForFunction(
    () => (window as unknown as { structuralDeleteTiming: unknown }).structuralDeleteTiming,
  );
  return page.evaluate(
    () => (window as unknown as { structuralDeleteTiming: unknown }).structuralDeleteTiming,
  );
}

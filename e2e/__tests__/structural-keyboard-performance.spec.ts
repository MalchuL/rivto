import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const mode of ["block", "edgeless"] as const) {
  for (const repeat of [0, 200]) {
    test(`moves a structural selection between adjacent blocks in ${mode}, repeat=${repeat}`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await page.goto(`/?repeat=${repeat}`);
      await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
      await page.evaluate(() => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        editor.history.batchUpdates(() => {
          editor.blocks.insertBlock({ id: "structural-perf-separator", type: "separator" });
          editor.blocks.insertBlock({
            id: "structural-perf-first",
            type: "paragraph",
            content: "First",
          });
          editor.blocks.insertBlock({
            id: "structural-perf-second",
            type: "paragraph",
            content: "Second",
          });
        });
      });
      if (mode === "edgeless") {
        await expect
          .poll(() =>
            page.evaluate(() =>
              (
                window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
              ).__rivtoDemo.editor.elements
                .getElementNodes()
                .some(
                  (element) =>
                    element.type === "block" &&
                    element.props.startBlockId === "structural-perf-first" &&
                    element.props.endBlockId === "structural-perf-second",
                ),
            ),
          )
          .toBe(true);
        await page.evaluate(() => {
          const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
            .__rivtoDemo.editor;
          const card = editor.elements
            .getElementNodes()
            .find(
              (element) =>
                element.type === "block" && element.props.startBlockId === "structural-perf-first",
            )!;
          editor.elements.updateElement(card.id, {
            frame: { x: 60, y: 60, width: 400, height: 180 },
            zIndex: 100000,
          });
        });
        await page.locator('[data-editor-mode="edgeless"]').click();
      }
      const first = page.locator('[data-block-id="structural-perf-first"] [data-block-content]');
      const second = page.locator('[data-block-id="structural-perf-second"] [data-block-content]');
      const samples = [];
      for (let index = 0; index < 3; index++) {
        await first.click();
        await page.keyboard.press("Alt+ArrowDown");
        samples.push(await measureDown(page));
        await expect(second.locator("xpath=ancestor::*[@data-block-id][1]")).toHaveAttribute(
          "data-block-selected",
          "true",
        );
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                (
                  window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
                ).__rivtoDemo.editor.selection.get()?.focusBlockId,
            ),
          )
          .toBe("structural-perf-second");
      }
      console.log(JSON.stringify({ interaction: "structural-keyboard", mode, repeat, samples }));
    });
  }
}

/**
 * Measures one ArrowDown delivery and two subsequent browser frames.
 *
 * @param page - Warm editor focused at the first block.
 * @returns Synchronous delivery and two-frame durations in milliseconds.
 */
async function measureDown(page: Page) {
  await page.evaluate(() => {
    const state = window as unknown as { structuralTiming: unknown };
    state.structuralTiming = null;
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
                state.structuralTiming = { sync, frames: performance.now() - start };
              }),
            );
          },
          { once: true },
        );
      },
      { capture: true, once: true },
    );
  });
  await page.keyboard.press("ArrowDown");
  await page.waitForFunction(
    () => (window as unknown as { structuralTiming: unknown }).structuralTiming,
  );
  return page.evaluate(() => (window as unknown as { structuralTiming: unknown }).structuralTiming);
}

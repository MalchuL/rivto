import { measureEventDelivery } from "./measure-event-delivery";
import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const mode of ["block", "edgeless"] as const) {
  for (const repeat of [0, 200]) {
    test(`moves a caret between adjacent blocks in ${mode}, repeat=${repeat}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto(`/?repeat=${repeat}`);
      await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
      await page.evaluate(() => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        editor.history.batchUpdates(() => {
          editor.blocks.insertBlock({ id: "horizontal-perf-separator", type: "separator" });
          editor.blocks.insertBlock({
            id: "horizontal-perf-first",
            type: "paragraph",
            content: "First",
          });
          editor.blocks.insertBlock({
            id: "horizontal-perf-second",
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
                    element.props.startBlockId === "horizontal-perf-first" &&
                    element.props.endBlockId === "horizontal-perf-second",
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
                element.type === "block" && element.props.startBlockId === "horizontal-perf-first",
            )!;
          editor.elements.updateElement(card.id, {
            frame: { x: 60, y: 60, width: 400, height: 180 },
            zIndex: 100000,
          });
        });
        await page.locator('[data-editor-mode="edgeless"]').click();
      }
      const first = page.locator('[data-block-id="horizontal-perf-first"] [data-block-content]');
      const second = page.locator('[data-block-id="horizontal-perf-second"] [data-block-content]');
      const samples = [];
      for (let index = 0; index < 3; index++) {
        await second.click();
        await page.keyboard.press("Home");
        samples.push(await measureLeft(page));
        await expect(first).toBeFocused();
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                (
                  window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
                ).__rivtoDemo.editor.selection.get()?.focusBlockId,
            ),
          )
          .toBe("horizontal-perf-first");
      }
      console.log(JSON.stringify({ interaction: "horizontal-caret", mode, repeat, samples }));
    });
  }
}

/**
 * Measures one ArrowLeft delivery and two subsequent browser frames.
 *
 * @param page - Warm editor focused at the start of the second block.
 * @returns Synchronous delivery and two-frame durations in milliseconds.
 */
async function measureLeft(page: Page) {
  return measureEventDelivery(page, "keydown", () => page.keyboard.press("ArrowLeft"));
}

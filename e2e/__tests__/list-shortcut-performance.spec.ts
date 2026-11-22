import { measureEventDelivery } from "./measure-event-delivery";
import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const mode of ["block", "edgeless"] as const) {
  for (const repeat of [0, 200]) {
    test(`converts list shortcuts in ${mode}, repeat=${repeat}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto(`/?repeat=${repeat}`);
      await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
      await page.evaluate(() => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        editor.history.batchUpdates(() => {
          editor.blocks.insertBlock({ id: "list-perf-separator", type: "separator" });
          editor.blocks.insertBlock({
            id: "list-perf-first",
            type: "paragraph",
            content: "-",
          });
          editor.blocks.insertBlock({
            id: "list-perf-second",
            type: "paragraph",
            content: "-",
          });
          editor.blocks.insertBlock({ id: "list-perf-third", type: "paragraph", content: "-" });
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
                    element.props.startBlockId === "list-perf-first" &&
                    element.props.endBlockId === "list-perf-third",
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
                element.type === "block" && element.props.startBlockId === "list-perf-first",
            )!;
          editor.elements.updateElement(card.id, {
            frame: { x: 60, y: 60, width: 400, height: 180 },
            zIndex: 100000,
          });
        });
        await page.locator('[data-editor-mode="edgeless"]').click();
      }
      const samples = [];
      for (const name of ["first", "second", "third"]) {
        const id = `list-perf-${name}`;
        const content = page.locator(`[data-block-id="${id}"] [data-block-content]`);
        await content.click();
        await page.keyboard.press("End");
        samples.push(await measureSpace(page));
        await expect(content).toBeFocused();
        await expect(content).toHaveText("");
        await expect
          .poll(() =>
            page.evaluate((blockId) => {
              const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
                .__rivtoDemo.editor;
              return editor.blocks.getBlockNode(blockId)?.listProps.type;
            }, id),
          )
          .toBe("list");
      }
      console.log(JSON.stringify({ interaction: "list-shortcut", mode, repeat, samples }));
    });
  }
}

/**
 * Measures one beforeinput delivery and two subsequent browser frames.
 *
 * @param page - Warm editor focused on the list marker.
 * @returns Synchronous delivery and two-frame durations in milliseconds.
 */
async function measureSpace(page: Page) {
  return measureEventDelivery(page, "beforeinput", () => page.keyboard.type(" "));
}

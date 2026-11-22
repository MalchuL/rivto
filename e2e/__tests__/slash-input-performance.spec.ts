import { measureEventDelivery } from "./measure-event-delivery";
import { expect, test, type Page } from "@playwright/test";

for (const mode of ["block", "edgeless"] as const) {
  for (const repeat of [0, 200]) {
    test(`opens slash commands in ${mode}, repeat=${repeat}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto(`/?repeat=${repeat}`);
      await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
      await page.evaluate(() => {
        const editor = window.__rivtoDemo.editor;
        editor.history.batchUpdates(() => {
          editor.blocks.insertBlock({ id: "slash-perf-separator", type: "separator" });
          for (const id of ["first", "second", "third"]) {
            editor.blocks.insertBlock({ id: `slash-perf-${id}`, type: "paragraph", content: "" });
          }
        });
      });
      if (mode === "edgeless") {
        await expect
          .poll(() =>
            page.evaluate(() =>
              window.__rivtoDemo.editor.elements
                .getElementNodes()
                .some(
                  (item) => item.type === "block" && item.props.startBlockId === "slash-perf-first",
                ),
            ),
          )
          .toBe(true);
        await page.evaluate(() => {
          const editor = window.__rivtoDemo.editor;
          const card = editor.elements
            .getElementNodes()
            .find(
              (item) => item.type === "block" && item.props.startBlockId === "slash-perf-first",
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
        const content = page.locator(`[data-block-id="slash-perf-${name}"] [data-block-content]`);
        await content.click();
        samples.push(await measureInput(page));
        await expect(page.locator("[data-slash-menu]")).toBeVisible();
        await expect(content).toBeFocused();
        await expect(content).toHaveText("/");
        await page.keyboard.press("Escape");
        await expect(page.locator("[data-slash-menu]")).toHaveCount(0);
      }
      console.log(JSON.stringify({ interaction: "slash-input", mode, repeat, samples }));
    });
  }
}

/**
 * Measures slash input dispatch and the next two browser frames.
 *
 * @param page - Warm editor focused on an empty writing block.
 * @returns Synchronous input delivery and two-frame durations in milliseconds.
 */
async function measureInput(page: Page) {
  return measureEventDelivery(page, "input", () => page.keyboard.type("/"));
}

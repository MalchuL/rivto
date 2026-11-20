import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const mode of ["block", "edgeless"] as const) {
  for (const repeat of [0, 200]) {
    test(`parses custom clipboard HTML in ${mode}, repeat=${repeat}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto(`/?repeat=${repeat}`);
      await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
      const id = await page.evaluate(() => {
        const { editor } = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo;
        return editor.blocks.insertBlock(
          { type: "paragraph", content: "HTML paste target" },
          editor.blocks.getInsertionDestinationAfter(editor.blocks.getRootIds()[0]!),
        ).id;
      });
      if (mode === "edgeless") {
        await page.locator('[data-editor-mode="edgeless"]').click();
      }
      const target = page.locator(`[data-block-id="${id}"] [data-block-content]`).first();
      await target.scrollIntoViewIfNeeded();
      const samples: { sync: number; rendered: number }[] = [];
      for (let sample = 0; sample < 4; sample++) {
        await target.click();
        const timing = await target.evaluate(async (element, count) => {
          const data = new DataTransfer();
          data.setData(
            "text/html",
            `<p data-rivto-block="counter" data-count="${count}">Count: ${count}</p>`,
          );
          const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
          Object.defineProperty(event, "clipboardData", { value: data });
          const start = performance.now();
          element.dispatchEvent(event);
          const sync = performance.now() - start;
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
          return { sync, rendered: performance.now() - start };
        }, 10000 + sample);
        await expect
          .poll(() =>
            page.evaluate((count) => {
              const { editor } = (
                window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
              ).__rivtoDemo;
              return editor.blocks
                .getBlocks()
                .some((block) => block.type === "demo.counter" && block.props.count === count);
            }, 10000 + sample),
          )
          .toBe(true);
        samples.push(timing);
      }
      console.log(
        JSON.stringify({ interaction: "clipboard-html", mode, repeat, samples: samples.slice(1) }),
      );
    });
  }
}

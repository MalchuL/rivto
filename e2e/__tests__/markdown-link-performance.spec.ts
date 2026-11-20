import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const mode of ["block", "edgeless"] as const) {
  for (const repeat of [0, 200]) {
    test(`delegates a Markdown link in ${mode}, repeat=${repeat}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto(`/?repeat=${repeat}`);
      await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
      const id = await page.evaluate(() => {
        const { editor } = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo;
        return editor.blocks.insertBlock(
          { type: "paragraph", content: "[Local](chulane:page/measurement)" },
          editor.blocks.getInsertionDestinationAfter(editor.blocks.getRootIds()[0]!),
        ).id;
      });
      if (mode === "edgeless") {
        await page.locator('[data-editor-mode="edgeless"]').click();
      }
      const link = page.locator(`[data-block-id="${id}"] .markdown-preview a`).first();
      await link.scrollIntoViewIfNeeded();
      await page.evaluate(() => {
        (window as unknown as { linkCount: number }).linkCount = 0;
        window.addEventListener(
          "rivto:markdown-link",
          () => (window as unknown as { linkCount: number }).linkCount++,
        );
      });
      const samples: { sync: number; rendered: number }[] = [];
      for (let sample = 0; sample < 4; sample++) {
        const timing = await link.evaluate(async (element) => {
          const event = new MouseEvent("click", { bubbles: true, cancelable: true });
          const start = performance.now();
          element.dispatchEvent(event);
          const sync = performance.now() - start;
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
          return { sync, rendered: performance.now() - start, prevented: event.defaultPrevented };
        });
        expect(timing.prevented).toBe(true);
        await expect
          .poll(() => page.evaluate(() => (window as unknown as { linkCount: number }).linkCount))
          .toBe(sample + 1);
        samples.push(timing);
      }
      console.log(
        JSON.stringify({ interaction: "markdown-link", mode, repeat, samples: samples.slice(1) }),
      );
    });
  }
}

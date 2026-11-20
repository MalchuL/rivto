import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const mode of ["block", "edgeless"] as const) {
  for (const repeat of [0, 200]) {
    test(`resolves a row hover in ${mode}, repeat=${repeat}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto(`/?repeat=${repeat}`);
      await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
      const id = await page.evaluate(() => {
        const { editor } = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo;
        return editor.blocks.insertBlock(
          { type: "paragraph", content: "Hover measurement" },
          editor.blocks.getInsertionDestinationAfter(editor.blocks.getRootIds()[0]!),
        ).id;
      });
      if (mode === "edgeless") {
        await page.locator('[data-editor-mode="edgeless"]').click();
      }
      const row = page.locator(`[data-block-id="${id}"] > .rivto-block-row`).first();
      await row.scrollIntoViewIfNeeded();
      const samples: { sync: number; rendered: number }[] = [];
      for (let sample = 0; sample < 4; sample++) {
        const timing = await row.evaluate(async (element) => {
          const root = element.closest("[data-rivto-block-editor]")!;
          root.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }));
          const bounds = element.getBoundingClientRect();
          const event = new PointerEvent("pointermove", {
            bubbles: true,
            pointerType: "mouse",
            clientX: bounds.left + 10,
            clientY: bounds.top + bounds.height / 2,
          });
          const start = performance.now();
          element.dispatchEvent(event);
          const sync = performance.now() - start;
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
          return { sync, rendered: performance.now() - start };
        });
        await expect(row).toHaveAttribute("data-block-row-hover", "");
        samples.push(timing);
      }
      console.log(
        JSON.stringify({ interaction: "block-row-hover", mode, repeat, samples: samples.slice(1) }),
      );
    });
  }
}

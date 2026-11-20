import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const repeat of [0, 200]) {
  test(`copies an embedding from the block menu, repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
    const id = await page.evaluate(() => {
      const { editor } = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo;
      return editor.blocks.insertBlock(
        { type: "paragraph", content: "Clipboard measurement" },
        editor.blocks.getInsertionDestinationAfter(editor.blocks.getRootIds()[0]!),
      ).id;
    });
    await page.evaluate(() => {
      const runtime = window as unknown as {
        clipboardWrites: number;
        clipboardStarted: number;
        clipboardTimes: number[];
      };
      runtime.clipboardWrites = 0;
      runtime.clipboardTimes = [];
      Object.defineProperty(window, "ClipboardItem", {
        configurable: true,
        value: class ClipboardItem {},
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          write: async () => {
            runtime.clipboardWrites++;
            runtime.clipboardTimes.push(performance.now() - runtime.clipboardStarted);
          },
        },
      });
    });
    for (let sample = 0; sample < 4; sample++) {
      const row = page
        .locator(`[data-journal-document="today"] [data-block-id="${id}"] > .rivto-block-row`)
        .first();
      await row.hover();
      await row
        .locator(":scope > :is(.rivto-slot, .rivto-block-slot) > .block-handle")
        .click({ button: "right" });
      const item = page.getByRole("menuitem", { name: "Copy block embedding", exact: true });
      await item.evaluate((element) =>
        element.addEventListener(
          "pointerdown",
          () => {
            (window as unknown as { clipboardStarted: number }).clipboardStarted =
              performance.now();
          },
          { once: true, capture: true },
        ),
      );
      await item.click();
      await expect
        .poll(() =>
          page.evaluate(() => (window as unknown as { clipboardWrites: number }).clipboardWrites),
        )
        .toBe(sample + 1);
    }
    const samples = await page.evaluate(() =>
      (window as unknown as { clipboardTimes: number[] }).clipboardTimes.slice(1),
    );
    console.log(JSON.stringify({ interaction: "clipboard-menu", repeat, samples }));
  });
}

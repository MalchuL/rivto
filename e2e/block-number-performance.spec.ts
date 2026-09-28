/**
 * Regression coverage for demo gutter numbering during outline commands.
 * Real keyboard commands must share one numbering rebuild across mounted rows,
 * preserve the caret, and update depth without changing document-order labels.
 */
import { expect, test } from "@playwright/test";

const BLOCK_NUMBER_CLASS = "demo-block-number";

for (const repeat of [20, 200]) {
  test(`shares outline reads during indent and outdent with repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    const id = await page.evaluate(() => {
      const { editor } = (window as unknown as {
        __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
      }).__rivtoDemo;
      return editor.blocks.getRootIds()[1]!;
    });
    const row = page.locator(`[data-block-id="${id}"]`);
    const number = row.locator(`.${BLOCK_NUMBER_CLASS}`).first();
    await row.locator("[data-block-content]").first().click();
    const originalNumber = await number.textContent();
    await page.evaluate(() => {
      const runtime = window as unknown as {
        __rivtoDemo: { reactEditor: import("@chulane/rivto-react").ReactEditor };
        __outlineReads: number;
      };
      const blocks = runtime.__rivtoDemo.reactEditor.blocks;
      const getBlocks = blocks.getBlocks.bind(blocks);
      runtime.__outlineReads = 0;
      blocks.getBlocks = () => {
        runtime.__outlineReads += 1;
        return getBlocks();
      };
    });

    for (const [key, depth] of [["Tab", "1"], ["Shift+Tab", "0"]] as const) {
      await page.evaluate(() => {
        const runtime = window as unknown as {
          __outlineReads: number;
          __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
        };
        runtime.__outlineReads = 0;
        runtime.__rivtoDemo.editor.history.stopCapturing();
      });
      await page.keyboard.press(key);
      await expect(number).toHaveText(originalNumber!);
      await expect(number).toHaveCSS("--demo-block-depth", depth);
      const state = await page.evaluate(async () => {
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const runtime = window as unknown as {
          __outlineReads: number;
          __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
        };
        return { reads: runtime.__outlineReads, focus: runtime.__rivtoDemo.editor.selection.get()?.focusBlockId };
      });
      // Collapse reconciliation also reads the forest. Allow that fixed work,
      // but never one full-document read for every mounted gutter label.
      expect(state.reads).toBeLessThan(10);
      expect(state.focus).toBe(id);
    }
    for (const [operation, depth] of [["undo", "1"], ["redo", "0"]] as const) {
      await page.evaluate((action) => {
        (window as unknown as {
          __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
        }).__rivtoDemo.editor.history[action]();
      }, operation);
      await expect(number).toHaveText(originalNumber!);
      await expect(number).toHaveCSS("--demo-block-depth", depth);
    }
  });
}

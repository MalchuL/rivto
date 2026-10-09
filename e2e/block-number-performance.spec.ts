/**
 * Regression coverage for demo gutter numbering during outline commands.
 * Real keyboard commands must share one numbering rebuild across mounted rows,
 * preserve the caret, and update depth without changing document-order labels.
 */
import { expect, test } from "@playwright/test";

const BLOCK_NUMBER_CLASS = "demo-block-number";

for (const repeat of [0, 200]) {
  test(`shares outline reads during indent and outdent with repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    await expect(page.locator('[data-journal-document="today"] [data-block-content]').first()).toBeVisible();
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
        __rivtoDemo: { editorRuntime: import("@chulane/rivto-react").EditorRuntime };
        __outlineReads: number;
        __contentQueries: number;
      };
      runtime.__contentQueries = 0;
      const query = Element.prototype.querySelectorAll;
      Element.prototype.querySelectorAll = function (selector: string) {
        if (selector === "[data-block-content]") runtime.__contentQueries += 1;
        return query.call(this, selector);
      } as typeof query;
      const blocks = runtime.__rivtoDemo.editorRuntime.blocks;
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
        __contentQueries: number;
          __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
        };
        runtime.__outlineReads = 0;
        runtime.__contentQueries = 0;
        runtime.__rivtoDemo.editor.history.stopCapturing();
      });
      await page.keyboard.press(key);
      await expect(number).toHaveText(originalNumber!);
      await expect(number).toHaveCSS("--demo-block-depth", depth);
      const state = await page.evaluate(async () => {
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const runtime = window as unknown as {
          __outlineReads: number;
        __contentQueries: number;
          __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
        };
        return { reads: runtime.__outlineReads, queries: runtime.__contentQueries, focus: runtime.__rivtoDemo.editor.selection.get()?.focusBlockId };
      });
      // Numbering rebuilds once; caret and collapse must not read the forest.
      expect(state.reads).toBeLessThanOrEqual(1);
      expect(state.queries).toBeLessThan(30);
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

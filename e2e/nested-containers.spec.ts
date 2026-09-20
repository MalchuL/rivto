/**
 * Browser coverage for nested layout containers in page and edgeless modes.
 *
 * The document is rebuilt from portable block input so the demo seed does not
 * have to contain every pairing. Keyboard indent/outdent must stay inside
 * each declared floor.
 *
 * @module
 */
import { expect, test } from "@playwright/test";

for (const mode of ["block", "edgeless"] as const) {
  test(`nested kanban-in-bento and columns-in-kanban stay floored in ${mode}`, async ({ page }) => {
    await page.goto("/");
    await page.evaluate((nextMode) => {
      const runtime = (window as unknown as {
        __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
      }).__rivtoDemo.editor;
      const editor = runtime;
      const bento = editor.blocks.insertBlock({
        type: "bento",
        content: "Outer bento",
        children: [{
          type: "kanban",
          content: "Nested kanban",
          children: [
            {
              type: "kanban-column",
              content: "Lane",
              children: [
                { type: "paragraph", content: "Card" },
                {
                  type: "columns",
                  children: [
                    {
                      type: "columns-column",
                      children: [{ type: "paragraph", content: "Lane writing" }],
                    },
                  ],
                },
              ],
            },
            { type: "kanban-column", content: "Other" },
          ],
        }],
      }).id;
      const keep = editor.blocks.getBlock(bento)!;
      editor.load({ ...editor.dump(), blocks: [keep], elements: [] });
      if (nextMode === "edgeless") {
        editor.elements.insertElement({
          type: "block",
          zIndex: 0,
          frame: { x: 20, y: 20, width: 900, height: 700 },
          props: { startBlockId: keep.id, endBlockId: keep.id },
        });
      }
    }, mode);
    if (mode === "edgeless") await page.locator('[data-editor-mode="edgeless"]').click();

    const ids = await page.evaluate(() => {
      const editor = (window as unknown as {
        __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
      }).__rivtoDemo.editor;
      const all = editor.blocks.getBlocks().flatMap(function walk(block): string[] {
        return [block.id, ...block.children.flatMap(walk)];
      });
      return {
        card: all.find((id) => editor.blocks.getBlock(id)?.content === "Card")!,
        writing: all.find((id) => editor.blocks.getBlock(id)?.content === "Lane writing")!,
      };
    });

    await page.locator(`[data-block-id="${ids.card}"] [contenteditable='plaintext-only']`).click();
    await page.keyboard.press("Shift+Tab");
    await expect.poll(() => page.evaluate((id) => {
      const editor = (window as unknown as {
        __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
      }).__rivtoDemo.editor;
      const parent = editor.blocks.getBlock(editor.blocks.getParentId(id) ?? "");
      return parent?.type;
    }, ids.card)).toBe("kanban-column");

    await page.locator(`[data-block-id="${ids.writing}"] [contenteditable='plaintext-only']`).click();
    await page.keyboard.press("Shift+Tab");
    await expect.poll(() => page.evaluate((id) => {
      const editor = (window as unknown as {
        __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
      }).__rivtoDemo.editor;
      const parent = editor.blocks.getBlock(editor.blocks.getParentId(id) ?? "");
      return parent?.type;
    }, ids.writing)).toBe("columns-column");
  });
}

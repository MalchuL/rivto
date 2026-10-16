/** Regression coverage for stable nesting across a Bento tile's padded row. */
import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

const ROW_CLASS = "page-block-row";
const HANDLE_CLASS = "block-handle";

for (const mode of ["block", "edgeless"] as const) {
  test(`Bento row sweep nests into the hovered tile in ${mode}`, async ({ page }) => {
    await page.goto("/");
    const ids = await page.evaluate((mode) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      const board = editor.blocks.insertBlock({
        type: "bento",
        children: [
          { type: "paragraph", content: "Previous tile", props: { bentoWidth: 200 } },
          { type: "paragraph", content: "Hovered tile", props: { bentoWidth: 200 } },
          { type: "paragraph", content: "Dragged tile", props: { bentoWidth: 200 } },
        ],
      });
      editor.history.clear();
      editor.load({ ...editor.dump(), rootElementIds: [], blocks: [board], elements: [] });
      if (mode === "edgeless") {
        editor.elements.insertElement({
          type: "block",
          zIndex: 0,
          frame: { x: 20, y: 20, width: 800, height: 400 },
          props: { startBlockId: board.id, endBlockId: board.id },
        });
      }
      return {
        board: board.id,
        previous: board.children[0].id,
        target: board.children[1].id,
        source: board.children[2].id,
      };
    }, mode);
    if (mode === "edgeless") {
      await page.locator('[data-editor-mode="edgeless"]').click();
    }
    const target = page.locator(`[data-block-id="${ids.target}"]`);
    const previous = page.locator(`[data-block-id="${ids.previous}"]`);
    const source = page.locator(`[data-block-id="${ids.source}"]`);
    const handle = source.locator(`:scope > .${ROW_CLASS} .${HANDLE_CLASS}`);
    await source.hover();
    await handle.hover();
    const from = (await handle.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2);
    const row = (await target.locator(`:scope > .${ROW_CLASS}`).boundingBox())!;
    for (let y = Math.ceil(row.y); y < row.y + row.height; y++) {
      await page.mouse.move(row.x + row.width / 2, y);
      await expect(target, `hovered row at y=${y}`).toHaveAttribute("data-drop-inside", "true");
      await expect(previous).not.toHaveAttribute("data-drop-inside", "true");
    }
    await page.mouse.up();
    await expect(target.locator(`[data-block-id="${ids.source}"]`)).toHaveCount(1);
    expect(
      await page.evaluate((id) => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        return editor.blocks.getParentId(id);
      }, ids.source),
    ).toBe(ids.target);
    await page.evaluate(() => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      editor.history.undo();
    });
    await expect(
      page.locator(`[data-block-id="${ids.board}"] > .page-block-children > [data-block-id]`),
    ).toHaveCount(3);
    await page.evaluate(() => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      editor.history.redo();
    });
    await expect(target.locator(`[data-block-id="${ids.source}"]`)).toHaveCount(1);
  });
}

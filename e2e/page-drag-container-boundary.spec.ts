import { expect, test } from "@playwright/test";

const containers = [
  { type: "kanban", content: "Board", children: [{ type: "kanban-column", content: "Lane" }] },
  { type: "todo-storage", children: [{ type: "paragraph", content: "Stored" }] },
  { type: "bento", children: [{ type: "paragraph", content: "Tile" }] },
  { type: "columns", children: [{ type: "columns-column" }] },
  { type: "table", children: [{ type: "table-row", children: [{ type: "table-cell" }] }] },
] as const;

for (const mode of ["block", "edgeless"] as const) {
  for (const container of containers) {
    test(`keeps the gap above ${container.type} a sibling drop in ${mode}`, async ({ page }) => {
      await page.goto("/");
      const ids = await page.evaluate(({ input, nextMode }) => {
        const editor = (window as unknown as {
          __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
        }).__rivtoDemo.editor;
        const source = editor.blocks.insertBlock({ type: "paragraph", content: "Source" }).id;
        const upper = editor.blocks.insertBlock({ type: "paragraph", content: "Upper" }).id;
        const lower = editor.blocks.insertBlock(input).id;
        editor.load({ ...editor.dump(), blocks: [source, upper, lower].map((id) => editor.blocks.getBlock(id)!), elements: [] });
        if (nextMode === "edgeless") {
          editor.elements.insertElement({
            type: "block", zIndex: 0,
            frame: { x: 20, y: 20, width: 900, height: 800 },
            props: { startBlockId: source, endBlockId: lower },
          });
        }
        return { source, upper, lower };
      }, { input: container, nextMode: mode });
      if (mode === "edgeless") await page.locator('[data-editor-mode="edgeless"]').click();
      const source = page.locator(`[data-block-id="${ids.source}"]`).first();
      const handle = source.locator(":scope > .page-block-row .page-drag-handle");
      await source.locator(":scope > .page-block-row").hover();
      await handle.hover();
      const from = (await handle.boundingBox())!;
      const lower = page.locator(`[data-block-id="${ids.lower}"]`).first();
      const box = (await lower.boundingBox())!;
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(from.x + 8, from.y + 8, { steps: 3 });
      for (const offset of [-1, 1, -1]) {
        await page.mouse.move(box.x + box.width / 2, box.y + offset, { steps: 15 });
        await expect(lower).not.toHaveAttribute("data-drop-inside", "true");
        await expect(page.locator('.page-drop-indicator[data-kind="between"]')).toBeVisible();
      }
      await page.mouse.up();
      await expect.poll(() => page.evaluate(() => {
        const editor = (window as unknown as {
          __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
        }).__rivtoDemo.editor;
        return editor.blocks.getRootIds();
      })).toEqual([ids.upper, ids.source, ids.lower]);
    });
  }
}

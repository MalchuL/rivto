import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const mode of ["block", "edgeless"] as const) {
  test(`resizes Kanban columns using the block width in ${mode}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto("/?test_features=1");
    const ids = await page.evaluate((surface) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      const board = editor.blocks.getBlocks().find((block) => block.type === "kanban")!;
      editor.load({ ...editor.dump(), rootElementIds: [], blocks: [board], elements: [] });
      if (surface === "edgeless") {
        editor.elements.insertElement({
          type: "block",
          zIndex: 0,
          frame: { x: 220, y: 180, width: 950, height: 500 },
          props: { startBlockId: board.id, endBlockId: board.id },
        });
      }
      editor.history.clear();
      return board.children.map((column) => column.id);
    }, mode);
    await page.locator(`[data-editor-mode="${mode}"]`).click();
    const column = page.locator(`[data-block-id="${ids[0]}"]`).first();
    const sibling = page.locator(`[data-block-id="${ids[1]}"]`).first();
    await column.scrollIntoViewIfNeeded();
    const right = column.getByRole("separator", { name: "Resize Kanban column from the right" });
    await expect(right).toBeVisible();
    if (mode === "edgeless") {
      await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    }
    const initial = await column.evaluate((element) => (element as HTMLElement).offsetWidth);
    const scale = (await column.boundingBox())!.width / initial;
    if (mode === "edgeless") {
      expect(scale).toBeGreaterThan(1);
    }
    const dragged = initial + 40 / scale;
    const other = await sibling.evaluate((element) => element.getBoundingClientRect().width);
    const box = (await right.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 40, y, { steps: 4 });
    await expect(column).toHaveAttribute("data-width-resizing", "right");
    expect(await sibling.evaluate((element) => element.getBoundingClientRect().width)).toBeCloseTo(
      other,
      0,
    );
    await page.mouse.up();
    await expect(column).not.toHaveAttribute("data-width-resizing");
    const readWidth = () =>
      page.evaluate((id) => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        const size = (
          editor.blocks.getBlockNode(id)?.listProps.style as
            { size?: { width?: string } } | undefined
        )?.size;
        return Number.parseFloat(size?.width ?? "");
      }, ids[0]!);
    await expect.poll(readWidth).toBeCloseTo(dragged, 1);
    await page.evaluate(() =>
      (
        window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
      ).__rivtoDemo.editor.history.stopCapturing(),
    );
    await right.focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(readWidth).toBeCloseTo(dragged + 10, 1);
    await page.evaluate(() =>
      (
        window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
      ).__rivtoDemo.editor.history.undo(),
    );
    await expect.poll(readWidth).toBeCloseTo(dragged, 1);
    const beforeCancel = await readWidth();
    const left = column.getByRole("separator", { name: "Resize Kanban column from the left" });
    const updated = (await left.boundingBox())!;
    await page.mouse.move(updated.x + updated.width / 2, updated.y + updated.height / 2);
    await page.mouse.down();
    await page.mouse.move(updated.x - 30, updated.y + updated.height / 2);
    await expect(column).toHaveAttribute("data-width-resizing", "left");
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect.poll(readWidth).toBe(beforeCancel);
    await expect(column).not.toHaveAttribute("data-width-resizing");
    await left.focus();
    await page.keyboard.press("ArrowLeft");
    await expect.poll(readWidth).toBeCloseTo(dragged + 10, 1);
    await page.evaluate((id) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      editor.blocks.updateBlock(id, {
        listProps: { style: { size: { width: "360px", widthPolicy: "clip" } } },
      });
      const snapshot = editor.dump();
      editor.load(snapshot);
    }, ids[0]!);
    await expect(column).toHaveCSS("width", "360px");
    await expect(column).toHaveCSS("overflow-x", "hidden");
  });
}

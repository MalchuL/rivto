/** Browser coverage for responsive Bento layout, widths, shared modal and editing. */
import { expect, test } from "@playwright/test";

for (const mode of ["block", "edgeless"]) {
  test(`Bento editing and layout in ${mode}`, async ({ page }) => {
    await page.goto("/");
    await page.evaluate((mode) => {
      const { editor } = (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto-react").ReactEditor } }).__rivtoDemo.editor;
      const board = editor.blocks.getBlocks().find((block) => block.type === "bento")!;
      editor.load({ ...editor.dump(), blocks: [board], elements: [] });
      if (mode === "edgeless") editor.elements.insertElement({ type: "block", zIndex: 0,
        frame: { x: 20, y: 20, width: 800, height: 600 }, props: { startBlockId: board.id, endBlockId: board.id } });
    }, mode);
    if (mode === "edgeless") await page.locator('[data-editor-mode="edgeless"]').click();
    const board = page.locator('[data-block-type="bento"]');
    const tiles = board.locator(':scope > [id^="block-children-"] > [data-block-id]');
    await expect(tiles).toHaveCount(3);
    await board.getByRole("button", { name: "Expand Bento", exact: true }).click();
    await expect(page.locator("dialog:modal")).toBeVisible();
    await board.getByRole("button", { name: "Bento settings", exact: true }).click();
    const slider = board.getByRole("slider", { name: "Width of tile 1" });
    await slider.fill("440");
    await expect(tiles.first()).toHaveCSS("flex-basis", "440px");
    await board.getByRole("button", { name: "Bento settings", exact: true }).click();
    const editable = tiles.first().getByRole("textbox").first();
    await editable.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await expect(tiles).toHaveCount(4);
    await page.keyboard.type("New tile");
    await expect(tiles.nth(1)).toContainText("New tile");
    await board.getByRole("button", { name: "Collapse Bento", exact: true }).click();
    await expect(page.locator("dialog:modal")).toHaveCount(0);
    // Width preferences survive snapshot reload, and tiles shrink to their surface.
    await page.evaluate(() => {
      const { editor } = (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto-react").ReactEditor } }).__rivtoDemo.editor;
      editor.load(editor.dump());
    });
    await expect(tiles.first()).toHaveCSS("flex-basis", "440px");
    if (mode === "block") await page.setViewportSize({ width: 420, height: 800 });
    const box = (await board.boundingBox())!;
    for (const tile of await tiles.all()) expect((await tile.boundingBox())!.width).toBeLessThanOrEqual(box.width);
    await page.evaluate(() => {
      const { editor } = (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto-react").ReactEditor } }).__rivtoDemo.editor;
      const board = editor.blocks.getBlocks().find((block) => block.type === "bento")!;
      editor.blocks.removeBlocks(board.children.map((child) => child.id));
    });
    await board.getByRole("textbox").first().click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await expect(tiles).toHaveCount(1);
    await expect(tiles.first().getByRole("textbox")).toBeFocused();
    await page.keyboard.type("First tile");
    await expect(tiles.first()).toContainText("First tile");
  });
}

for (const edge of ["between", "under", "inside"]) {
  test(`Bento drag placement ${edge}`, async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      const { editor } = (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto-react").ReactEditor } }).__rivtoDemo.editor;
      const board = editor.blocks.getBlocks().find((block) => block.type === "bento")!;
      editor.load({ ...editor.dump(), blocks: [board], elements: [] });
    });
    const board = page.locator('[data-block-type="bento"]');
    await board.getByRole("button", { name: "Expand Bento", exact: true }).click();
    const tiles = board.locator(':scope > [id^="block-children-"] > [data-block-id]');
    const source = tiles.first();
    const target = tiles.nth(1);
    const sourceId = await source.getAttribute("data-block-id");
    const targetId = await target.getAttribute("data-block-id");
    const rowClass = "page-block-row";
    const handleClass = "page-drag-handle";
    const handle = source.locator(`:scope > .${rowClass} .${handleClass}`);
    await source.hover();
    await handle.hover();
    const from = (await handle.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 10, from.y + 10, { steps: 3 });
    await page.mouse.move(to.x + (edge === "between" ? to.width - 2 : to.width / 2),
      to.y + (edge === "under" ? to.height - 1 : to.height / 2), { steps: 15 });
    if (edge === "inside") await expect(target).toHaveAttribute("data-drop-inside", "true");
    else {
      const lineClass = "page-drop-line";
      await expect(target.locator(`:scope > .${lineClass}`)).toBeVisible();
    }
    await page.mouse.up();
    if (edge === "inside") await expect(page.locator(`[data-block-id="${targetId}"] [data-block-id="${sourceId}"]`)).toHaveCount(1);
    else await expect(tiles.nth(1)).toHaveAttribute("data-block-id", sourceId!);
  });
}

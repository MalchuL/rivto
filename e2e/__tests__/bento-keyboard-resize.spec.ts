import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const mode of ["block", "edgeless"] as const) {
  test(`keyboard resize stays inside the expanded Bento panel in ${mode}`, async ({ page }) => {
    await page.goto("/");
    await page.evaluate((surfaceMode) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      const board = editor.blocks.getBlocks().find((block) => block.type === "bento")!;
      editor.load({ ...editor.dump(), rootElementIds: [], blocks: [board], elements: [] });
      if (surfaceMode === "edgeless") {
        editor.elements.insertElement({
          type: "block",
          zIndex: 0,
          frame: { x: 20, y: 20, width: 800, height: 600 },
          props: { startBlockId: board.id, endBlockId: board.id },
        });
      }
    }, mode);
    if (mode === "edgeless") {
      await page.locator('[data-editor-mode="edgeless"]').click();
    }
    const board = page.locator('[data-block-type="bento"]').first();
    await board.getByRole("button", { name: "Expand Bento", exact: true }).click();
    await expect(page.getByRole("dialog", { name: /^Expanded / })).toBeVisible();
    const tile = board.locator(":scope > .rivto-block-children > .rivto-bento-tile").first();
    const id = await tile.locator("[data-block-id]").first().getAttribute("data-block-id");
    expect(id).toBeTruthy();
    await tile.hover();
    const handle = tile.getByRole("separator", { name: "Resize Bento tile from the right" });
    await handle.focus();
    const initialWidth = Number(await handle.getAttribute("aria-valuenow"));
    await page.evaluate(() => {
      const state = window as unknown as { bentoBubbleKeys: string[] };
      state.bentoBubbleKeys = [];
      document.addEventListener("keydown", (event) => state.bentoBubbleKeys.push(event.key));
    });
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Shift+ArrowRight");
    await expect
      .poll(() =>
        page.evaluate((blockId) => {
          const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
            .__rivtoDemo.editor;
          return editor.blocks.getBlockNode(blockId!)?.props.bentoWidth;
        }, id),
      )
      .toBe(initialWidth + 60);
    await expect(handle).toBeFocused();
    await expect(page.getByRole("dialog", { name: "Expanded Bento" })).toBeVisible();
    expect(
      await page.evaluate(
        () => (window as unknown as { bentoBubbleKeys: string[] }).bentoBubbleKeys,
      ),
    ).not.toContain("ArrowRight");
    await page.keyboard.press("a");
    expect(
      await page.evaluate(
        () => (window as unknown as { bentoBubbleKeys: string[] }).bentoBubbleKeys,
      ),
    ).toContain("a");
  });
}

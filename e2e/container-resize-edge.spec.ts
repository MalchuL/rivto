import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const mode of ["block", "edgeless"] as const) {
  for (const type of ["bento", "kanban"] as const) {
    test(`${type} resize handles reach both edges in ${mode}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 1000 });
      await page.goto("/?test_features=1");
      const id = await page.evaluate(
        ({ type, mode }) => {
          const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
            .__rivtoDemo.editor;
          const board = editor.blocks.getBlocks().find((block) => block.type === type)!;
          editor.load({ ...editor.dump(), rootElementIds: [], blocks: [board], elements: [] });
          if (mode === "edgeless") {
            editor.elements.insertElement({
              type: "block",
              zIndex: 0,
              frame: { x: 20, y: 20, width: 950, height: 500 },
              props: { startBlockId: board.id, endBlockId: board.id },
            });
          }
          return board.children[0]!.id;
        },
        { type, mode },
      );
      await page.locator(`[data-editor-mode="${mode}"]`).click();
      const block = page.locator(`[data-block-id="${id}"]`).first();
      const placement =
        type === "bento"
          ? block.locator(
              "xpath=ancestor::*[contains(concat(' ',normalize-space(@class),' '),' rivto-bento-tile ')][1]",
            )
          : block;
      await placement.scrollIntoViewIfNeeded();
      const visibleBox =
        type === "bento"
          ? placement.locator(":scope > .rivto-block-drop-wrapper-content")
          : placement;
      for (const edge of ["left", "right"] as const) {
        const label = `Resize ${type === "bento" ? "Bento tile" : "Kanban column"} from the ${edge}`;
        const handle = placement.getByRole("separator", { name: label });
        await expect(handle).toBeVisible();
        const box = (await placement.boundingBox())!;
        const visible = (await visibleBox.boundingBox())!;
        const x = edge === "left" ? visible.x + 1 : visible.x + visible.width - 1;
        const y = visible.y + visible.height / 2;
        const hit = await page.evaluate(
          ({ x, y }) => document.elementFromPoint(x, y)?.getAttribute("aria-label"),
          { x, y },
        );
        expect(hit).toBe(label);
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + (edge === "left" ? -20 : 20), y, { steps: 4 });
        await expect(placement).toHaveAttribute("data-width-resizing", edge);
        await page.mouse.up();
        await expect(placement).not.toHaveAttribute("data-width-resizing");
        await expect
          .poll(async () => (await placement.boundingBox())!.width)
          .toBeGreaterThan(box.width);
      }
    });
  }
}

import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

type Container = "bento" | "todo-storage";
type Mode = "block" | "edgeless";

/**
 * Mounts a container between source and following siblings in the chosen surface.
 *
 * @param page - Browser owning the demo editor.
 * @param type - Container whose last child receives the drag.
 * @param mode - Surface in which to render the fixture.
 * @returns Resolves after the destination is mounted.
 */
async function load(page: Page, type: Container, mode: Mode): Promise<void> {
  await page.setViewportSize({ width: 1500, height: 1100 });
  await page.goto("/?test_features=1");
  await page.locator('[data-journal-document="today"] > .page-surface').waitFor();
  await page.evaluate(
    ({ type, mode }) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
      const leaf = type === "todo-storage" ? "todo-item" : "paragraph";
      editor.blocks.insertBlock({ id: "source", type: leaf, content: "Source" });
      editor.blocks.insertBlock({
        id: "board",
        type,
        children: [
          { id: "first", type: leaf, content: "First" },
          { id: "last", type: leaf, content: "Last" },
        ],
      });
      editor.blocks.insertBlock({ id: "after", type: "paragraph", content: "After" });
      if (mode === "edgeless") {
        editor.elements.insertElement({
          type: "block",
          zIndex: 0,
          frame: { x: 20, y: 20, width: 850, height: 950 },
          props: { startBlockId: "source", endBlockId: "after" },
        });
      }
      editor.history.clear();
    },
    { type, mode },
  );
  await page.locator(`[data-editor-mode="${mode}"]`).click();
  await expect(page.locator('[data-block-id="last"]')).toBeVisible();
}

/**
 * Starts a native drag from the source handle.
 *
 * @param page - Demo with the source mounted.
 * @returns Resolves when the drag has crossed its activation threshold.
 */
async function startDrag(page: Page): Promise<void> {
  const row = page.locator('[data-block-id="source"] > .rivto-block-row');
  await row.hover();
  const handle = (await row.locator(".block-handle").boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 10, handle.y + handle.height / 2, {
    steps: 3,
  });
  await expect(page.locator('[data-block-id="source"]')).toHaveAttribute("data-dragging", "true");
}

for (const type of ["bento", "todo-storage"] as const) {
  for (const mode of ["block", "edgeless"] as const) {
    test(`${type} retains its last item's bottom boundary in ${mode}`, async ({ page }) => {
      await load(page, type, mode);
      const last = page.locator('[data-block-id="last"]');
      const anchor =
        type === "bento" ? last.locator("xpath=ancestor::*[@data-drop-wrapper-axis][1]") : last;
      const lastBox = (await last.boundingBox())!;
      const anchorBox = (await anchor.boundingBox())!;
      await startDrag(page);
      const line = page.locator(".rivto-block-drop-line:visible");
      await page.mouse.move(lastBox.x + lastBox.width / 2, lastBox.y + lastBox.height / 2);
      await expect(last).toHaveAttribute("data-block-drop-active", "true");
      await expect(line).toHaveCount(0);
      for (const offset of [-5, -1, -3, -5]) {
        await page.mouse.move(lastBox.x + 4, lastBox.y + lastBox.height + offset, { steps: 8 });
        await expect(line).toHaveCount(1);
        const lineBox = (await line.boundingBox())!;
        expect(lineBox.y + lineBox.height / 2).toBeCloseTo(anchorBox.y + anchorBox.height, 1);
      }
      await page.mouse.up();
      await expect
        .poll(() =>
          page.evaluate(() =>
            (
              window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
            ).__rivtoDemo.editor.blocks.getChildIds("board"),
          ),
        )
        .toEqual(["first", "last", "source"]);
      await page.keyboard.press("ControlOrMeta+z");
      await expect
        .poll(() =>
          page.evaluate(() =>
            (
              window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
            ).__rivtoDemo.editor.blocks.getChildIds("board"),
          ),
        )
        .toEqual(["first", "last"]);
      if (mode === "edgeless") {
        await startDrag(page);
        const board = (await page.locator('[data-block-id="board"]').boundingBox())!;
        const after = (await page.locator('[data-block-id="after"]').boundingBox())!;
        const seam = (board.y + board.height + after.y) / 2;
        await page.mouse.move(board.x + 4, seam, { steps: 8 });
        await expect(line).toHaveCount(1);
        await page.mouse.up();
        await expect
          .poll(() =>
            page.evaluate(() =>
              (
                window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
              ).__rivtoDemo.editor.blocks.getRootIds(),
            ),
          )
          .toEqual(["board", "source", "after"]);
      }
    });

    test(`${type} retains the boundary after the container in ${mode}`, async ({ page }) => {
      await load(page, type, mode);
      await startDrag(page);
      const board = (await page.locator('[data-block-id="board"]').boundingBox())!;
      const after = (await page.locator('[data-block-id="after"]').boundingBox())!;
      const seam = (board.y + board.height + after.y) / 2;
      await page.mouse.move(board.x + 4, seam, { steps: 8 });
      const line = page.locator(".rivto-block-drop-line:visible");
      await expect(line).toHaveCount(1);
      const bounds = (await line.boundingBox())!;
      expect(bounds.y + bounds.height / 2).toBeCloseTo(seam, 1);
      await page.mouse.up();
      await expect
        .poll(() =>
          page.evaluate(() =>
            (
              window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
            ).__rivtoDemo.editor.blocks.getRootIds(),
          ),
        )
        .toEqual(["board", "source", "after"]);
      await page.keyboard.press("ControlOrMeta+z");
      await expect
        .poll(() =>
          page.evaluate(() =>
            (
              window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
            ).__rivtoDemo.editor.blocks.getRootIds(),
          ),
        )
        .toEqual(["source", "board", "after"]);
    });
  }
}

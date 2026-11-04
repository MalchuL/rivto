import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { DocumentEditorAPI, EditorSnapshot } from "@chulane/rivto";

const snapshot = JSON.parse(
  await readFile(new URL("./fixtures/nested-drop-report.snapshot.json", import.meta.url), "utf8"),
) as EditorSnapshot;
const sourceId = "23a0f636-0d4a-4b9a-8c7f-f8164889e942";
const boardId = "6fbc8120-8d76-4652-ad0a-77a38a0d16d2";
const tileId = "8204a41e-c060-4555-ba11-46c7e4f89267";
const todoId = "8cda00f6-310b-48a6-9a1b-332438e9fea4";

/**
 * Starts a native drag from the captured source block.
 *
 * @param page - Demo displaying the restored snapshot.
 * @returns Resolves when the pointer crosses the drag threshold.
 */
async function startDrag(page: Page): Promise<void> {
  const row = page.locator(`[data-block-id="${sourceId}"] > .rivto-block-row`);
  await row.hover();
  const handle = row.locator(".block-handle");
  await handle.hover();
  const box = (await handle.boundingBox())!;
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2, { steps: 3 });
}

for (const mode of ["block", "edgeless"] as const) {
  test(`nested boundary ownership stays consistent through a wrapping control in ${mode}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 1600 });
    await page.goto("/?test_features=1");
    await page.locator('[data-journal-document="today"] > .page-surface').waitFor();
    await page.evaluate(
      ({ snapshot, mode, sourceId, boardId }) => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        editor.load(snapshot);
        if (mode === "edgeless") {
          editor.elements.insertElement({
            type: "block",
            zIndex: 0,
            frame: { x: 20, y: 20, width: 1000, height: 1400 },
            props: { startBlockId: sourceId, endBlockId: boardId },
          });
        }
        editor.history.clear();
      },
      { snapshot, mode, sourceId, boardId },
    );
    await page.locator(`[data-editor-mode="${mode}"]`).click();
    const tile = page.locator(`[data-block-id="${tileId}"]`);
    const todo = page.locator(`[data-block-id="${todoId}"]`);
    await startDrag(page);
    const tileBox = (await tile.boundingBox())!;
    const todoBox = (await todo.boundingBox())!;
    const y = todoBox.y + todoBox.height - 2;
    const line = page.locator(".rivto-block-drop-line:visible");
    for (const offsets of [
      [0, 2, 4, 6, 8],
      [8, 6, 4, 2, 0],
    ]) {
      for (const offset of offsets) {
        await page.mouse.move(tileBox.x + offset, y);
        await expect(line).toHaveAttribute("data-axis", "vertical");
      }
    }
    await page.mouse.up();
    await expect
      .poll(() =>
        page.evaluate(
          (id) =>
            (
              window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
            ).__rivtoDemo.editor.blocks.getParentId(id),
          sourceId,
        ),
      )
      .toBe(boardId);
    await expect
      .poll(() =>
        page.evaluate(
          ({ boardId }) =>
            (
              window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
            ).__rivtoDemo.editor.blocks.getChildIds(boardId),
          { boardId },
        ),
      )
      .toEqual([
        "37ee29f4-7d80-46a9-a3c8-72341cd7d39d",
        "abeae9a4-32b2-447b-95f7-ce46ae375615",
        sourceId,
        tileId,
      ]);
    await page.keyboard.press("ControlOrMeta+z");
    await expect
      .poll(() =>
        page.evaluate(
          (id) =>
            (
              window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
            ).__rivtoDemo.editor.blocks.getParentId(id),
          sourceId,
        ),
      )
      .toBeNull();
    for (const [offset, parentId] of [
      [40, tileId],
      [100, todoId],
    ] as const) {
      await startDrag(page);
      const currentTile = (await tile.boundingBox())!;
      const currentTodo = (await todo.boundingBox())!;
      await page.mouse.move(currentTile.x + offset, currentTodo.y + currentTodo.height - 2);
      await expect(line).toHaveAttribute("data-axis", "horizontal");
      await page.mouse.up();
      await expect
        .poll(() =>
          page.evaluate(
            (id) =>
              (
                window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
              ).__rivtoDemo.editor.blocks.getParentId(id),
            sourceId,
          ),
        )
        .toBe(parentId);
      await page.keyboard.press("ControlOrMeta+z");
      await expect
        .poll(() =>
          page.evaluate(
            (id) =>
              (
                window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
              ).__rivtoDemo.editor.blocks.getParentId(id),
            sourceId,
          ),
        )
        .toBeNull();
    }
  });
}

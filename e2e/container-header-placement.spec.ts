import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI, EditorBlockInput } from "@chulane/rivto";

/**
 * Builds equivalent receiving content with only native structural lanes differing.
 *
 * @param type - Production container whose title will receive pointer input.
 * @returns Container input and actual parent accepting ordinary source blocks.
 */
function receivingContainer(type: string): { block: EditorBlockInput; parent: string } {
  const children = [
    { id: "first", type: "paragraph", content: "First" },
    { id: "last", type: "paragraph", content: "Last" },
  ];
  if (type === "kanban") {
    return {
      block: {
        id: "target",
        type,
        content: "Target",
        children: [{ id: "lane", type: "kanban-column", content: "Lane", children }],
      },
      parent: "lane",
    };
  }
  return { block: { id: "target", type, content: "Target", children }, parent: "target" };
}

/**
 * Starts the real source handle and moves to the receiving header.
 *
 * @param page - Browser page owning native mouse input.
 * @param point - Header viewport coordinates after applying layout changes.
 * @returns Resolves with the drag held so the chosen feedback can be inspected.
 */
async function dragToHeader(page: Page, point: { x: number; y: number }): Promise<void> {
  const row = page.locator('[data-block-id="moving"] > .rivto-block-row');
  await row.hover();
  const handle = row.locator(".block-handle");
  await handle.hover();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 10, box.y + 10, { steps: 3 });
  await page.mouse.move(point.x, point.y, { steps: 12 });
}

/**
 * Verifies nearest geometry and actual commit after changing only header padding.
 *
 * @param page - Browser containing the mounted fixture.
 * @param parent - Actual child-list parent, separate from structural board ownership.
 * @param padding - Additional header padding in CSS pixels.
 * @returns Resolves after checking the chosen line, persisted parent and undo.
 */
async function verifyHeader(page: Page, parent: string, padding: number): Promise<void> {
  const header = page.locator('[data-block-id="target"] .rivto-block-row').first();
  await header.evaluate((element, padding) => {
    element.style.paddingTop = `${padding}px`;
  }, padding);
  const row = (await header.boundingBox())!;
  const container = (await page.locator('[data-block-id="target"]').boundingBox())!;
  const first = await page.locator('[data-block-id="first"]').evaluate((element) => {
    let item = element;
    while (item.parentElement && !item.parentElement.classList.contains("rivto-block-children")) {
      item = item.parentElement;
    }
    return item.getBoundingClientRect().toJSON();
  });
  const point = { x: Math.max(row.x + 24, first.x + 16), y: row.y + row.height - 3 };
  const child = Math.abs(first.y - point.y) < Math.abs(container.y - point.y);
  await dragToHeader(page, point);
  const line = page.locator(".rivto-block-drop-line:visible");
  await expect(line).toBeVisible();
  const rect = (await line.boundingBox())!;
  expect(rect.y + rect.height / 2).toBeCloseTo(child ? first.y : container.y, 0);
  await page.mouse.up();
  await verifyHeaderMove(page, parent, child);
}

/**
 * Checks the native drop's persisted parent and order, then restores it with undo.
 *
 * @param page - Browser containing the completed gesture.
 * @param parent - Actual receiving child-list owner.
 * @param child - Whether geometry selected that child list instead of the outer gap.
 * @returns Resolves when the move and its single undo have restored the expected hierarchy.
 */
async function verifyHeaderMove(page: Page, parent: string, child: boolean): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
          ).__rivtoDemo.editor.blocks.getParentId("moving") ?? null,
      ),
    )
    .toBe(child ? parent : null);
  if (child) {
    expect(
      await page.evaluate(
        (parent) =>
          (
            window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
          ).__rivtoDemo.editor.blocks.getChildIds(parent),
        parent,
      ),
    ).toEqual(["moving", "first", "last"]);
  } else {
    expect(
      await page.evaluate(() =>
        (
          window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
        ).__rivtoDemo.editor.blocks.getRootIds(),
      ),
    ).toEqual(["moving", "target"]);
  }
  await page.keyboard.press("ControlOrMeta+z");
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
        ).__rivtoDemo.editor.blocks.getRootIds(),
      ),
    )
    .toEqual(["target", "moving"]);
}

for (const type of ["bento", "kanban", "todo-storage"]) {
  for (const mode of ["block", "edgeless"] as const) {
    test(`nearest permitted insertion from ${type} header in ${mode}`, async ({ page }) => {
      await page.setViewportSize({ width: 1400, height: 1200 });
      await page.goto("/");
      await page.locator(".page-surface").first().waitFor();
      const { block, parent } = receivingContainer(type);
      await page.evaluate(
        ({ block, mode }) => {
          const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
            .__rivtoDemo.editor;
          editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
          editor.blocks.insertBlock(block);
          editor.blocks.insertBlock({ id: "moving", type: "paragraph", content: "Moving" });
          if (mode === "edgeless") {
            editor.elements.insertElement({
              type: "block",
              zIndex: 0,
              frame: { x: 20, y: 20, width: 950, height: 1000 },
              props: { startBlockId: "target", endBlockId: "moving" },
            });
          }
          editor.history.clear();
        },
        { block, mode },
      );
      await page.locator(`[data-editor-mode="${mode}"]`).click();
      for (const padding of [4, 100]) {
        await verifyHeader(page, parent, padding);
      }
    });
  }
}

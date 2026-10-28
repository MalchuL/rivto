import { expect, test, type Locator, type Page } from "@playwright/test";
import type { DocumentEditorAPI, EditorSnapshot } from "@chulane/rivto";
import { readFile } from "node:fs/promises";

const snapshot = JSON.parse(
  await readFile(new URL("./fixtures/deep-outline-drop.snapshot.json", import.meta.url), "utf8"),
) as EditorSnapshot;

const branchId = "484123b8-5803-491c-bbed-0ea1c82c68ba";
const previousId = "52cfea11-0ab3-434c-9709-87b4158226f5";
const siblingId = "f7a4b092-ff6d-468f-93a9-43cdcd096df4";
const targetId = "e23ef113-6fe6-434d-a2d6-f5093666c2c1";
const sourceId = "47db524d-f67b-4e69-b50e-596888de69b8";

/**
 * Loads the captured deep outline into the production demo or a real container.
 *
 * @param page - Test-owned browser page.
 * @param container - Native container receiving the unchanged captured subtree, or null for the document.
 * @returns Resolves when the receiving text and source handle are mounted.
 */
async function loadOutline(page: Page, container: string | null): Promise<void> {
  await page.setViewportSize({ width: 1400, height: 1800 });
  await page.goto("/?test_features=1");
  await page.locator('[data-journal-document="today"] > .page-surface').waitFor();
  await page.evaluate(
    ({ snapshot, container }) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      editor.load(snapshot);
      if (container) {
        const content = editor.blocks.getBlock("484123b8-5803-491c-bbed-0ea1c82c68ba")!;
        editor.blocks.removeBlocks([content.id!]);
        const children =
          container === "kanban"
            ? [{ id: "lane", type: "kanban-column", content: "Lane", children: [content] }]
            : [content];
        editor.blocks.insertBlock(
          { id: "container", type: container, children },
          {
            parentId: null,
            beforeId: editor.blocks.getRootIds()[0],
          },
        );
      }
      editor.history.clear();
    },
    { snapshot, container },
  );
  await page.locator(`[data-block-id="${targetId}"]`).waitFor();
}

/**
 * Starts a real handle drag without changing selection or geometry through editor calls.
 *
 * @param page - Browser page owning the native pointer.
 * @returns Resolves with the source subtree held beyond the activation threshold.
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

/**
 * Sweeps the exposed deep gutter into its ancestor's inset and back at a fixed outline depth.
 *
 * @param page - Browser with an active native drag.
 * @param line - Sole visible insertion indicator.
 * @param x - Viewport X within the selected outline depth band.
 * @param bottom - Complete deep branch's trailing border in viewport CSS pixels.
 * @returns Resolves after both sweep directions retain identical shared line geometry.
 */
async function verifyBoundary(page: Page, line: Locator, x: number, bottom: number): Promise<void> {
  await page.mouse.move(x, bottom + 2);
  await expect(line).toBeVisible();
  const expected = (await line.boundingBox())!;
  for (const offset of [-14, -13, -12, -11, -2, 2, -2, -11, -12, -13, -14]) {
    await page.mouse.move(x, bottom + offset);
    await expect
      .poll(async () => {
        const rect = await line.boundingBox();
        return rect && { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      })
      .toEqual({ x: expected.x, y: expected.y, width: expected.width, height: expected.height });
  }
}

for (const container of [null, "bento", "kanban", "todo-storage"]) {
  test(`keeps deep outdent feedback stationary in ${container ?? "the document"}`, async ({
    page,
  }) => {
    await loadOutline(page, container);
    const preceding = page.locator(`[data-block-id="${previousId}"]`);
    await startDrag(page);
    const bottom = await preceding.evaluate((element) => element.getBoundingClientRect().bottom);
    const x = await preceding.evaluate((element) => element.getBoundingClientRect().left + 3);
    const line = page.locator(".rivto-block-drop-line:visible");
    for (const indent of [0, 24]) {
      await verifyBoundary(page, line, x + indent, bottom);
    }
    await page.mouse.move(x, bottom + 2);
    await page.mouse.up();
    await expect
      .poll(() =>
        page.evaluate((sourceId) => {
          const blocks = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
            .__rivtoDemo.editor.blocks;
          return {
            parent: blocks.getParentId(sourceId),
            siblings: blocks.getChildIds("484123b8-5803-491c-bbed-0ea1c82c68ba"),
          };
        }, sourceId),
      )
      .toEqual({ parent: branchId, siblings: [previousId, sourceId, siblingId] });
    await page.keyboard.press("ControlOrMeta+z");
    await expect
      .poll(() =>
        page.evaluate(
          (sourceId) =>
            (
              window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
            ).__rivtoDemo.editor.blocks.getParentId(sourceId),
          sourceId,
        ),
      )
      .toBeNull();
  });
}

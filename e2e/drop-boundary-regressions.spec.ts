import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

/**
 * Loads a small real document with a draggable root and a nested destination.
 *
 * @param page - Test-owned demo page.
 * @param mode - Surface that renders the same block hierarchy.
 * @param type - Native parent layout under test.
 * @returns Resolves after all fixture blocks are mounted in the chosen surface.
 */
async function load(page: Page, mode: "block" | "edgeless", type = "paragraph") {
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto("/?test_features=1");
  await page.locator('[data-journal-document="today"] > .page-surface').waitFor();
  await page.evaluate(
    ({ mode, type }) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
      editor.blocks.insertBlock({
        id: "parent",
        type,
        content: "Parent",
        children: [{ id: "child", type: "paragraph", content: "Child" }],
      });
      editor.blocks.insertBlock({ id: "source", type: "paragraph", content: "Source" });
      if (mode === "edgeless") {
        editor.elements.insertElement({
          type: "block",
          zIndex: 0,
          frame: { x: 20, y: 20, width: 700, height: 400 },
          props: { startBlockId: "parent", endBlockId: "source" },
        });
      }
    },
    { mode, type },
  );
  await page.locator(`[data-editor-mode="${mode}"]`).click();
  await page.locator('[data-block-id="child"]').waitFor();
}

/**
 * Starts a native pointer drag from the source's visible handle.
 *
 * @param page - Page containing the mounted fixture.
 * @returns Resolves with the primary pointer held beyond the drag threshold.
 */
async function startDrag(page: Page) {
  const row = page.locator('[data-block-id="source"] > .rivto-block-row');
  await row.hover();
  const handle = row.locator(".block-handle");
  await handle.hover();
  const box = (await handle.boundingBox())!;
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2);
}

/**
 * Reads the committed canonical parent of the dragged source.
 *
 * @param page - Page owning the fixture editor.
 * @returns Current source parent ID, or null for a document root.
 */
async function sourceParent(page: Page) {
  return page.evaluate(() =>
    (
      window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
    ).__rivtoDemo.editor.blocks.getParentId("source"),
  );
}

/**
 * Reads canonical sibling order at the source's committed destination.
 *
 * @param page - Page owning the fixture editor.
 * @returns Current receiving parent's child IDs, or document root IDs.
 */
async function sourceSiblings(page: Page) {
  return page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    const parent = editor.blocks.getParentId("source");
    return parent ? editor.blocks.getBlockNode(parent)?.childIds : editor.blocks.getRootIds();
  });
}

for (const mode of ["block", "edgeless"] as const) {
  test(`one first-child drop line in ${mode}`, async ({ page }) => {
    await load(page, mode);
    await startDrag(page);
    const parent = (await page
      .locator('[data-block-id="parent"] > .rivto-block-row')
      .boundingBox())!;
    const child = (await page.locator('[data-block-id="child"] > .rivto-block-row').boundingBox())!;
    await page.mouse.move(child.x + 2, parent.y + parent.height - 1);
    const line = page.locator(".rivto-block-drop-line:visible");
    await expect(line).toBeVisible();
    await expect(line).toHaveCSS("background-color", "rgb(80, 56, 179)");
    await expect(line).toHaveCSS("height", "2px");
    const upper = (await line.boundingBox())!;
    await page.mouse.move(child.x + 2, child.y + 1);
    await expect.poll(async () => (await line.boundingBox())?.y).toBe(upper.y);
    await page.mouse.up();
    await expect.poll(() => sourceParent(page)).toBe("parent");
    await expect.poll(() => sourceSiblings(page)).toEqual(["source", "child"]);
  });

  test(`explicit tile edge wins over the container bottom in ${mode}`, async ({ page }) => {
    await load(page, mode, "bento");
    await page.locator(".rivto-bento-tiles").evaluate((element) => {
      element.style.padding = "0";
    });
    await startDrag(page);
    const edge = page.locator('[data-block-item-id="child"]');
    const box = (await edge.boundingBox())!;
    await page.mouse.move(box.x + 12, box.y + box.height - 1);
    await expect(page.locator(".rivto-block-drop-line:visible")).toBeVisible();
    await page.mouse.up();
    await expect.poll(() => sourceParent(page)).toBe("parent");
    await expect.poll(() => sourceSiblings(page)).toEqual(["child", "source"]);
  });

  test(`first handle click survives window blur without pointer movement in ${mode}`, async ({
    page,
  }) => {
    await load(page, mode);
    const row = page.locator('[data-block-id="source"] > .rivto-block-row');
    await row.hover();
    const handle = row.locator(".block-handle");
    await handle.hover();
    await page.evaluate(() => {
      window.dispatchEvent(new Event("blur"));
      window.dispatchEvent(new Event("focus"));
    });
    await page.mouse.down({ button: "right" });
    await page.mouse.up({ button: "right" });
    await expect(page.getByRole("menu").first()).toBeVisible();
  });
}

for (const mode of ["block", "edgeless"] as const) {
  for (const nested of [false, true]) {
    test(`one ${nested ? "append" : "outdent"} drop line after the last nested child in ${mode}`, async ({
      page,
    }) => {
      await load(page, mode);
      await page.evaluate(() => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        editor.blocks.insertBlock(
          { id: "tail", type: "paragraph", content: "Tail" },
          editor.blocks.getInsertionDestinationAfter("parent"),
        );
      });
      await startDrag(page);
      const parent = (await page.locator('[data-block-id="parent"]').boundingBox())!;
      const child = (await page
        .locator('[data-block-id="child"] > .rivto-block-row')
        .boundingBox())!;
      const tail = (await page.locator('[data-block-id="tail"] > .rivto-block-row').boundingBox())!;
      const x = nested ? child.x + 14 : parent.x + 2;
      await page.mouse.move(x, child.y + child.height - 1);
      const line = page.locator(".rivto-block-drop-line:visible");
      await expect(line).toBeVisible();
      const upper = (await line.boundingBox())!;
      await page.mouse.move(x, tail.y + 1);
      await expect.poll(async () => (await line.boundingBox())?.y).toBe(upper.y);
      await page.mouse.up();
      await expect.poll(() => sourceParent(page)).toBe(nested ? "parent" : null);
      await expect
        .poll(() => sourceSiblings(page))
        .toEqual(nested ? ["child", "source"] : ["parent", "source", "tail"]);
    });
  }
}

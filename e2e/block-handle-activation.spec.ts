import { blockDropRegion } from "./drop-regions";
import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI, EditorBlockInput } from "@chulane/rivto";

type Layout = "paragraph" | "bento" | "columns" | "kanban";

/**
 * Builds two movable siblings, including a subtree that must move with its handle.
 *
 * @param layout - Ordinary roots or the native layout receiving the siblings.
 * @returns Portable roots with stable IDs for committed-order assertions.
 */
function input(layout: Layout): EditorBlockInput[] {
  const children: EditorBlockInput[] = [
    {
      id: "source",
      type: "paragraph",
      content: "Source",
      children: [{ id: "nested", type: "paragraph", content: "Nested" }],
    },
    { id: "target", type: "paragraph", content: "Target" },
  ];
  if (layout === "paragraph") {
    return children;
  }
  if (layout === "bento") {
    return [{ id: "board", type: layout, children }];
  }
  return [
    {
      id: "board",
      type: layout,
      children: [{ id: "lane", type: `${layout}-column`, content: "Lane", children }],
    },
  ];
}

/**
 * Loads a small native hierarchy without changing virtualization or interaction extensions.
 *
 * @param page - Browser page owned by the test.
 * @param layout - Layout containing the draggable siblings.
 * @param mode - Surface sharing the Page pointer implementation.
 * @returns Resolves after the source row is visible and the pointer is outside the editor.
 */
async function load(page: Page, layout: Layout, mode: "block" | "edgeless") {
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto("/");
  await page.locator('[data-journal-document="today"] > .page-surface').waitFor();
  await page.evaluate(
    ({ roots, mode }) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
      for (const root of roots) {
        editor.blocks.insertBlock(root);
      }
      if (mode === "edgeless") {
        editor.elements.insertElement({
          type: "block",
          zIndex: 0,
          frame: { x: 20, y: 20, width: 900, height: 600 },
          props: { startBlockId: roots[0]!.id, endBlockId: roots[roots.length - 1]!.id },
        });
      }
      editor.history.clear();
    },
    { roots: input(layout), mode },
  );
  await page.locator(`[data-editor-mode="${mode}"]`).click();
  await expect(page.locator('[data-block-id="source"]')).toBeVisible();
  await page.mouse.move(0, 0);
}

/**
 * Starts dragging with one direct pointer entry and one press, without warming the row.
 *
 * @param page - Page containing the source block and its initially hidden handle.
 * @returns Resolves with an active drag of the source, excluding its child as a separate source.
 */
async function startFromHandle(page: Page) {
  const source = page.locator('[data-block-id="source"]');
  const handle = source.locator(":scope > .rivto-block-row .block-handle");
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2);
  await expect(source).toHaveAttribute("data-dragging", "true");
  await expect(page.locator(".rivto-block-drag-preview:visible")).toHaveCount(1);
  await expect(page.locator('[data-block-id="nested"]')).not.toHaveAttribute(
    "data-dragging",
    "true",
  );
}

/**
 * Drops after the stationary sibling and verifies persisted order and subtree identity.
 *
 * @param page - Page with an active source drag.
 * @param layout - Native destination layout named in feedback assertion failures.
 * @returns Resolves after a committed move and its undo have restored the expected orders.
 */
async function commitAndUndo(page: Page, layout: Layout) {
  const edge = await blockDropRegion(page.locator('[data-block-id="target"]'), "after");
  const box = (await edge.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(
    page.locator(".rivto-block-drop-line:visible"),
    `${layout} sibling edge`,
  ).toHaveCount(1);
  await page.mouse.up();
  const order = () =>
    page.evaluate(() => {
      const e = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
        .editor;
      const parent = e.blocks.getParentId("source");
      return {
        ids: parent ? e.blocks.getBlockNode(parent)?.childIds : e.blocks.getRootIds(),
        nestedParent: e.blocks.getParentId("nested"),
      };
    });
  await expect.poll(order).toEqual({ ids: ["target", "source"], nestedParent: "source" });
  await page.keyboard.press("Control+z");
  await expect.poll(order).toEqual({ ids: ["source", "target"], nestedParent: "source" });
}

for (const layout of ["paragraph", "bento", "columns", "kanban"] as const) {
  for (const mode of ["block", "edgeless"] as const) {
    test(`${layout} starts and commits drag on first handle entry in ${mode}`, async ({ page }) => {
      await load(page, layout, mode);
      await startFromHandle(page);
      await commitAndUndo(page, layout);
    });

    test(`${layout} starts drag on first press after window return without movement in ${mode}`, async ({
      page,
    }) => {
      await load(page, layout, mode);
      const row = page.locator('[data-block-id="source"] > .rivto-block-row');
      await row.hover();
      const handle = row.locator(".block-handle");
      await handle.hover();
      const box = (await handle.boundingBox())!;
      // Window covering the editor can clear pointer ownership while the screen
      // cursor remains over the handle. Simulate that lifecycle, then use native
      // pointer input: no hover or move may warm the handle before the first press.
      await row.evaluate((element) => {
        element
          .closest("[data-rivto-block-editor]")!
          .dispatchEvent(new PointerEvent("pointerleave"));
        window.dispatchEvent(new Event("blur"));
        window.dispatchEvent(new Event("focus"));
      });
      await expect(row).not.toHaveAttribute("data-block-row-hover");
      await expect
        .poll(() =>
          handle.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            return element.contains(
              document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
            );
          }),
        )
        .toBe(true);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2);
      await expect(page.locator('[data-block-id="source"]')).toHaveAttribute(
        "data-dragging",
        "true",
        { timeout: 1000 },
      );
      // Activation is independent of destination resolution, exercised above.
      await page.keyboard.press("Escape");
      await page.mouse.up();
      await expect(page.locator(".rivto-block-drag-preview:visible")).toHaveCount(0);
      await expect(page.locator('[data-block-id="source"]')).not.toHaveAttribute(
        "data-dragging",
        "true",
      );
    });

    test(`${layout} starts drag after pointer leave and window lifecycle in ${mode}`, async ({
      page,
    }) => {
      await load(page, layout, mode);
      const row = page.locator('[data-block-id="source"] > .rivto-block-row');
      await row.hover();
      await page.mouse.move(0, 0);
      await expect(row).not.toHaveAttribute("data-block-row-hover");
      // This covers the lifecycle combination, not native OS window activation.
      await page.evaluate(() => {
        window.dispatchEvent(new Event("blur"));
        window.dispatchEvent(new Event("focus"));
      });
      await startFromHandle(page);
      await commitAndUndo(page, layout);
    });

    test(`${layout} opens block on first click after cleared hover in ${mode}`, async ({
      page,
    }) => {
      await load(page, layout, mode);
      const row = page.locator('[data-block-id="source"] > .rivto-block-row');
      await row.hover();
      await row.locator(".block-handle").hover();
      await row.evaluate((element) => {
        element
          .closest("[data-rivto-block-editor]")!
          .dispatchEvent(new PointerEvent("pointerleave"));
        window.dispatchEvent(new Event("blur"));
        window.dispatchEvent(new Event("focus"));
      });
      await expect(row).not.toHaveAttribute("data-block-row-hover");
      // Use down/up rather than locator.click(), which would restore hover first.
      await page.mouse.down();
      await page.mouse.up();
      await expect(page.locator('.demo-panel-header[data-panel-root="source"]')).toBeVisible();
    });
  }
}

import { blockDropRegion } from "./drop-regions";
import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

/**
 * Mounts three same-level siblings in the main demo without changing its extensions.
 *
 * @param page - Test-owned browser page.
 * @param mode - Surface rendering the siblings.
 * @param nested - Whether the siblings belong to an ordinary parent.
 * @returns Resolves when the middle row is mounted.
 */
async function load(page: Page, mode: "block" | "edgeless", nested: boolean) {
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto("/?test_features=1");
  await page.locator('[data-journal-document="today"] > .page-surface').waitFor();
  await page.evaluate(
    ({ mode, nested }) => {
      const e = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
        .editor;
      e.load({ ...e.dump(), blocks: [], elements: [], rootElementIds: [] });
      const children = ["upper", "middle", "lower"].map((id) => ({
        id,
        type: "paragraph",
        content: id,
      }));
      const roots = nested
        ? [{ id: "parent", type: "paragraph", content: "Parent", children }]
        : children;
      for (const root of roots) {
        e.blocks.insertBlock(root);
      }
      if (mode === "edgeless") {
        e.elements.insertElement({
          type: "block",
          zIndex: 0,
          frame: { x: 20, y: 20, width: 700, height: 400 },
          props: { startBlockId: roots[0]!.id, endBlockId: roots[roots.length - 1]!.id },
        });
      }
      e.history.clear();
    },
    { mode, nested },
  );
  await page.locator(`[data-editor-mode="${mode}"]`).click();
  await expect(page.locator('[data-block-id="middle"]')).toBeVisible();
}

/**
 * Checks that the painted line stays within the requested physical sibling gap.
 *
 * @param page - Page with an active drag.
 * @param top - Bottom of the preceding block in viewport pixels.
 * @param bottom - Top of the following block in viewport pixels.
 * @returns Resolves when exactly one line is in the gap and no inside outline is painted.
 */
async function expectGap(page: Page, top: number, bottom: number) {
  const line = page.locator(".rivto-block-drop-line:visible");
  await expect(line).toHaveCount(1);
  await expect
    .poll(async () => {
      const box = (await line.boundingBox())!;
      const center = box.y + box.height / 2;
      return center >= top - 0.5 && center <= bottom + 0.5;
    })
    .toBe(true);
  await expect(page.locator('[data-block-drop-active="true"]')).toHaveCount(0);
}

for (const mode of ["block", "edgeless"] as const) {
  for (const nested of [false, true]) {
    test(`middle source retains both adjacent gaps in ${mode}, nested=${nested}`, async ({
      page,
    }) => {
      await load(page, mode, nested);
      const row = page.locator('[data-block-id="middle"] > .rivto-block-row');
      await row.hover();
      const handle = (await row.locator(".block-handle").boundingBox())!;
      const middle = (await row.boundingBox())!;
      const upper = (await page.locator('[data-block-id="upper"]').boundingBox())!;
      const lower = (await page.locator('[data-block-id="lower"]').boundingBox())!;
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
      await page.mouse.down();
      await page.mouse.move(handle.x + handle.width / 2 + 10, handle.y + handle.height / 2);
      await expect(page.locator('[data-block-id="middle"]')).toHaveAttribute(
        "data-dragging",
        "true",
      );
      const source = page.locator('[data-block-id="middle"]');
      const before = (await (await blockDropRegion(source, "before")).boundingBox())!;
      const after = (await (await blockDropRegion(source, "after")).boundingBox())!;
      for (const offset of [1, 4, 8]) {
        await page.mouse.move(before.x + offset, before.y + before.height / 2);
        await expectGap(page, upper.y + upper.height, middle.y);
        await page.mouse.move(after.x + offset, after.y + after.height / 2);
        await expectGap(page, middle.y + middle.height, lower.y);
      }
      // Release in the declared sibling band, preserving the current canonical order.
      await page.mouse.move(after.x + 2, after.y + after.height / 2);
      await page.mouse.up();
      const state = await page.evaluate(() => {
        const e = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
          .editor;
        const parent = e.blocks.getParentId("middle");
        return {
          parent: parent ?? null,
          ids: parent ? e.blocks.getBlockNode(parent)?.childIds : e.blocks.getRootIds(),
        };
      });
      expect(state).toEqual({
        parent: nested ? "parent" : null,
        ids: ["upper", "middle", "lower"],
      });
    });
  }
}

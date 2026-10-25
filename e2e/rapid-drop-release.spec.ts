import { loseHandleRelease } from "./pointer-release";
import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

/**
 * Loads a card and an empty receiving Kanban lane through normal demo extensions.
 *
 * @param page - Isolated browser page receiving the gesture fixture.
 * @param mode - Surface sharing Page's native release controller.
 * @returns Resolves after both lanes are visible with a clear undo history.
 * @throws If navigation, fixture loading or surface mounting fails.
 */
async function load(page: Page, mode: "block" | "edgeless") {
  await page.setViewportSize({ width: 1500, height: 1100 });
  await page.goto("/");
  await page.locator('[data-journal-document="today"] > .page-surface').waitFor();
  await page.evaluate((mode) => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
    editor.blocks.insertBlock({
      id: "board",
      type: "kanban",
      children: [
        {
          id: "source-lane",
          type: "kanban-column",
          content: "Source lane",
          children: [{ id: "source", type: "paragraph", content: "Source card" }],
        },
        { id: "target-lane", type: "kanban-column", content: "Target lane" },
      ],
    });
    if (mode === "edgeless") {
      editor.elements.insertElement({
        type: "block",
        zIndex: 0,
        frame: { x: 20, y: 20, width: 850, height: 800 },
        props: { startBlockId: "board", endBlockId: "board" },
      });
    }
    editor.history.clear();
  }, mode);
  await page.locator(`[data-editor-mode="${mode}"]`).click();
  await expect(page.getByRole("button", { name: "Add card to Target lane" })).toBeVisible();
}

/**
 * Reads the card's canonical parent independently of feedback and navigation.
 *
 * @param page - Browser page containing the test document.
 * @returns Resolves with its parent ID, null at the root, or undefined if absent.
 * @throws If browser evaluation or the delegated document read fails.
 */
async function readSourceParent(page: Page) {
  return page.evaluate(() =>
    (
      window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
    ).__rivtoDemo.editor.blocks.getParentId("source"),
  );
}

for (const mode of ["block", "edgeless"] as const) {
  for (const delivery of ["normal", "stopped", "lost"] as const) {
    test(`release commits before immediate pointer exit, delivery=${delivery}, ${mode}`, async ({
      page,
    }) => {
      if (delivery === "lost") {
        await loseHandleRelease(page);
      }
      await load(page, mode);
      const source = page.locator('[data-block-id="source"]');
      const row = source.locator(":scope > .rivto-block-row");
      await row.hover();
      const handle = (await row.locator(".block-handle").boundingBox())!;
      const footer = page.getByRole("button", { name: "Add card to Target lane" });
      if (delivery === "stopped") {
        await footer.evaluate((element) =>
          element.addEventListener("pointerup", (event) => event.stopPropagation()),
        );
      }
      const target = (await footer.boundingBox())!;
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
      await page.mouse.down();
      await page.mouse.move(handle.x + handle.width / 2 + 12, handle.y + handle.height / 2, {
        steps: 3,
      });
      await expect(source).toHaveAttribute("data-dragging", "true");
      await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
        steps: 5,
      });
      await expect(page.locator('[data-block-id="target-lane"]')).toHaveAttribute(
        "data-block-drop-active",
        "true",
      );
      await Promise.all([page.mouse.up(), page.mouse.move(0, 0)]);
      await expect.poll(() => readSourceParent(page)).toBe("target-lane");
      await expect(
        page.locator("[data-dragging], [data-block-drop-active], .rivto-block-drag-preview"),
      ).toHaveCount(0);
      await page.keyboard.press("ControlOrMeta+z");
      await expect.poll(() => readSourceParent(page)).toBe("source-lane");
    });
  }
}

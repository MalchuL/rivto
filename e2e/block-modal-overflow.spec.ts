/** Browser regressions for the shared expanded container's scroll bounds. */
import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const label of ["Kanban", "Bento", "Table"]) {
  for (const mode of ["block", "edgeless"]) {
    test(`${label} dialog has no empty overflow from ${mode}`, async ({ page }) => {
      await page.goto("/");
      await page.evaluate(
        ({ label, mode }) => {
          const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
            .__rivtoDemo.editor;
          const board = editor.blocks
            .getBlocks()
            .find((block) => block.type === label.toLowerCase())!;
          editor.load({ ...editor.dump(), rootElementIds: [], blocks: [board], elements: [] });
          if (mode === "edgeless") {
            editor.elements.insertElement({
              type: "block",
              zIndex: 0,
              frame: { x: 20, y: 20, width: 800, height: 600 },
              props: { startBlockId: board.id, endBlockId: board.id },
            });
          }
        },
        { label, mode },
      );
      await page.locator(`[data-editor-mode="${mode}"]`).click();
      await page
        .getByRole("button", { name: `Expand ${label}`, exact: true })
        .first()
        .click();
      const dialog = page.getByRole("dialog", { name: `Expanded ${label}`, exact: true });
      await expect(dialog).toBeVisible();
      await expect
        .poll(() =>
          dialog.evaluate((element) => ({
            horizontal: element.scrollWidth - element.clientWidth,
            vertical: element.scrollHeight - element.clientHeight,
          })),
        )
        .toEqual({ horizontal: 0, vertical: 0 });
      await expect(dialog.getByRole("button", { name: `Collapse ${label}` })).toBeVisible();
      await dialog.getByRole("button", { name: `Collapse ${label}` }).click();
      await expect(dialog).toHaveCount(0);
    });
  }
}

test("expanded Bento keeps real vertical overflow scrollable", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    const board = editor.blocks.insertBlock({
      type: "bento",
      children: Array.from({ length: 60 }, (_, index) => ({
        type: "paragraph",
        content: `Overflow tile ${index}`,
      })),
    });
    editor.load({ ...editor.dump(), blocks: [board], elements: [], rootElementIds: [] });
  });
  await page.getByRole("button", { name: "Expand Bento", exact: true }).last().click();
  const dialog = page.getByRole("dialog", { name: "Expanded Bento", exact: true });
  expect(
    await dialog.evaluate((element) => element.scrollHeight - element.clientHeight),
  ).toBeGreaterThan(0);
  const lastTile = dialog.getByRole("textbox").filter({ hasText: "Overflow tile 59" });
  await lastTile.scrollIntoViewIfNeeded();
  await expect(lastTile).toBeInViewport();
  expect(await dialog.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
});

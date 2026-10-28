import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";
import { BLOCK_ROW_SELECTOR } from "./dom-markers";

for (const mode of ["block", "edgeless"] as const) {
  test(`checkbox styling follows its own row and undo in ${mode}`, async ({ page }) => {
    await page.goto("/?test_features=1");
    await page.evaluate((mode) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      const source = editor.blocks.insertBlock({
        id: "checked-parent",
        type: "paragraph",
        content: "Parent task",
        listProps: { type: "checkbox", checked: false },
        children: [
          {
            id: "unchecked-child",
            type: "paragraph",
            content: "Child task",
            listProps: { type: "checkbox", checked: false },
          },
        ],
      });
      editor.load({ ...editor.dump(), blocks: [source], elements: [], rootElementIds: [] });
      if (mode === "edgeless") {
        editor.elements.insertElement({
          type: "block",
          zIndex: 0,
          frame: { x: 20, y: 20, width: 800, height: 400 },
          props: { startBlockId: source.id, endBlockId: source.id },
        });
      }
      editor.history.clear();
    }, mode);
    await page.locator(`[data-editor-mode="${mode}"]`).click();
    const row = page.locator(`[data-block-id="checked-parent"] > ${BLOCK_ROW_SELECTOR}`).first();
    const content = row.locator("[data-block-content]").first();
    const child = page
      .locator(`[data-block-id="unchecked-child"] > ${BLOCK_ROW_SELECTOR} [data-block-content]`)
      .first();
    await row.getByRole("checkbox").check();
    await expect(content).toHaveCSS("text-decoration-line", "line-through");
    await expect(child).toHaveCSS("text-decoration-line", "none");
    await content.click();
    await page.keyboard.press("Control+z");
    await expect(row.getByRole("checkbox")).not.toBeChecked();
    await expect(content).toHaveCSS("text-decoration-line", "none");
    await page.keyboard.press("Control+Shift+z");
    await expect(row.getByRole("checkbox")).toBeChecked();
    await expect(content).toHaveCSS("text-decoration-line", "line-through");
  });
}

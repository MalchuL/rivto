import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";
import { blockIdSelector } from "./dom-markers";
import { showCanvasCard } from "./fixtures/canvas-card";

test("renders a visible rule for Markdown quotes in page and canvas", async ({ page }) => {
  await page.goto("/");
  const content = "> Last time we saw a kingfisher";
  const id = await page.evaluate((content) => {
    const { editor } = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
      .__rivtoDemo;
    return editor.blocks.insertBlock({ type: "paragraph", content }).id;
  }, content);
  const today = page.locator('[data-journal-document="today"]');
  for (const mode of ["block", "edgeless"]) {
    if (mode === "edgeless") {
      await showCanvasCard(page, [id]);
    }
    const block = today.locator(blockIdSelector(id));
    const quote = block.locator(".markdown-preview blockquote");
    await expect(quote).toBeVisible();
    await expect(quote).toHaveCSS("border-left-style", "solid");
    await expect(quote).toHaveCSS("border-left-width", "3px");
    await expect(quote).toHaveCSS("margin-left", "0px");
    const editor = block.locator(".markdown-editor");
    await editor.click();
    await expect(editor).toHaveText(content);
    await editor.blur();
    await expect(quote).toBeVisible();
  }
});

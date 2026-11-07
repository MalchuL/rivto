import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";
import type { PageBlockDecorationAdapter, ReactEditorApi } from "@chulane/rivto-react";

interface DecorationTestWindow extends Window {
  __rivtoDemo: { editor: DocumentEditorAPI; reactEditor: ReactEditorApi };
  originalDecorationAdapter?: PageBlockDecorationAdapter;
}

for (const mode of ["block", "edgeless"] as const) {
  for (const repeat of [0, 200]) {
    test(`updates shared block decorations in ${mode} mode, repeat=${repeat}`, async ({ page }) => {
      await page.goto(`/?test_features=1&repeat=${repeat}`);
      const id = await page.evaluate(() => {
        const { editor } = (window as unknown as DecorationTestWindow).__rivtoDemo;
        return editor.blocks.getRootIds()[0]!;
      });
      await page.locator(`[data-editor-mode="${mode}"]`).click();
      const block = page.locator(`[data-journal-document="today"] [data-block-id="${id}"]`).first();
      await expect(block).toHaveAttribute("data-block-background", "transparent");
      await page.evaluate((blockId) => {
        const runtime = window as unknown as DecorationTestWindow;
        const shared = runtime.__rivtoDemo.reactEditor.extensions.shared;
        const value = shared.getValue<PageBlockDecorationAdapter>("rivto.page.block-decorations")!;
        const original = value.get()!;
        runtime.originalDecorationAdapter = original;
        value.set({
          read: (node) => ({
            ...original.read(node),
            color: node.id === blockId ? "#123456" : original.read(node).color,
          }),
          prepare: (patch) => original.prepare(patch),
        });
      }, id);
      await expect(block).toHaveAttribute("data-block-background", "#123456");
      await expect(block).toHaveCSS("background-color", "rgb(18, 52, 86)");
      await page.evaluate(() => {
        const runtime = window as unknown as DecorationTestWindow;
        runtime.__rivtoDemo.reactEditor.extensions.shared
          .getValue<PageBlockDecorationAdapter>("rivto.page.block-decorations")!
          .set(runtime.originalDecorationAdapter);
      });
      await expect(block).toHaveAttribute("data-block-background", "transparent");
    });
  }
}

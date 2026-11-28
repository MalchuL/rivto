import type { Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

/**
 * Replaces the demo document with the fixture roots and shows them together in an Edgeless card.
 *
 * @param page - Demo page containing the fixture document.
 * @param ids - Nonempty ordered list of existing root IDs to display.
 * @returns Resolves after switching to the canvas containing the card.
 */
export async function showCanvasCard(page: Page, ids: string[]): Promise<void> {
  await page.evaluate((ids) => {
    const { editor } = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
      .__rivtoDemo;
    const snapshot = editor.dump();
    const blocks = ids.map((id) => snapshot.blocks.find((block) => block.id === id)!);
    editor.load({ ...snapshot, blocks, elements: [], rootElementIds: [] });
    editor.elements.insertElement({
      type: "block",
      zIndex: 0,
      frame: { x: 20, y: 20, width: 700, height: 500 },
      props: { startBlockId: ids[0], endBlockId: ids.at(-1) },
    });
  }, ids);
  await page.locator('[data-editor-mode="edgeless"]').click();
}

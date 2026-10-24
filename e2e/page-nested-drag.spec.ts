import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const edge of ["before", "after"] as const) {
  test(`Page routes the ${edge} edge of an embedded editor to its enclosing document`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 1200 });
    await page.goto("/");
    const ids = await page.evaluate((edge) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      const embed = editor.blocks.getBlocks().find((block) => block.type === "embedding")!;
      const source = editor.blocks.insertBlock({
        type: "paragraph",
        content: "Move beside embedding",
      });
      editor.blocks.moveBlocks([source.id], embed.id, edge === "before" ? "after" : "before");
      editor.history.clear();
      return { embed: embed.id, source: source.id, roots: editor.blocks.getRootIds() };
    }, edge);
    const surface = page.locator('[data-journal-document="today"] .page-surface').first();
    const reference = surface.locator(
      `:scope > .rivto-virtual-tree > div > [data-virtual-block-id] > [data-block-id="${ids.embed}"]`,
    );
    const nested = reference.locator("[data-rivto-block-editor]").first();
    await expect(nested).toBeVisible();
    const source = surface.locator(
      `:scope > .rivto-virtual-tree > div > [data-virtual-block-id] > [data-block-id="${ids.source}"]`,
    );
    await source.locator(":scope > .rivto-block-row").hover();
    const from = (await source.locator(".block-handle").boundingBox())!;
    const referenceBox = (await reference.boundingBox())!;
    const content = (await nested
      .locator(":scope > .rivto-virtual-tree > div > [data-virtual-block-id] > [data-block-id]")
      .first()
      .boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      referenceBox.x + 2,
      edge === "before" ? content.y + 1 : content.y + content.height - 1,
      { steps: 12 },
    );
    await expect(surface.locator(":scope > .rivto-block-drag-preview")).toBeVisible();
    await expect(surface.locator(":scope > .rivto-block-drop-line")).toBeVisible();
    await page.mouse.up();
    const expected = ids.roots.filter((id) => id !== ids.source);
    expected.splice(expected.indexOf(ids.embed) + Number(edge === "after"), 0, ids.source);
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
          ).__rivtoDemo.editor.blocks.getRootIds(),
        ),
      )
      .toEqual(expected);
    await expect(surface).toBeFocused();
    await page.keyboard.press("Control+z");
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
          ).__rivtoDemo.editor.blocks.getRootIds(),
        ),
      )
      .toEqual(ids.roots);
  });
}

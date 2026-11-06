import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const mode of ["block", "edgeless"] as const) {
  for (const repeat of [1, 200]) {
    test(`inserts from the block menu in ${mode} (repeat=${repeat})`, async ({ page }) => {
      await page.goto(`/?test_features=1&repeat=${repeat}`);
      const target = await page.evaluate(() => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        const first = editor.blocks.getRootIds()[0]!;
        return editor.blocks.insertBlock(
          { type: "paragraph", content: "Insertion target" },
          editor.blocks.getInsertionDestinationAfter(first),
        ).id;
      });
      if (mode === "edgeless") {
        await page.locator('[data-editor-mode="edgeless"]').click();
      }
      const row = page.locator(`[data-block-id="${target}"] > .rivto-block-row`).first();
      for (const [title, direction, type] of [
        ["Insert block above", -1, "paragraph"],
        ["Insert block below", 1, "paragraph"],
        ["Insert separator", 1, "separator"],
      ] as const) {
        await row.scrollIntoViewIfNeeded();
        await row.hover();
        await row.locator(".block-handle").click({ button: "right" });
        const menu = page.getByRole("menu").first();
        await expect(menu.getByRole("menuitem", { name: title, exact: true })).toBeVisible();
        const previous = await page.evaluate(() =>
          (
            window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
          ).__rivtoDemo.editor.blocks.getRootIds(),
        );
        await menu.getByRole("menuitem", { name: title, exact: true }).click();
        await expect
          .poll(() =>
            page.evaluate(
              ({ target, direction, previous }) => {
                const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
                  .__rivtoDemo.editor;
                const roots = editor.blocks.getRootIds();
                const id = roots[roots.indexOf(target) + direction];
                return id && !previous.includes(id)
                  ? editor.blocks.getBlockNode(id)?.type
                  : undefined;
              },
              { target, direction, previous },
            ),
          )
          .toBe(type);
        if (type === "paragraph") {
          const inserted = await page.evaluate(
            ({ target, direction }) => {
              const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
                .__rivtoDemo.editor;
              const roots = editor.blocks.getRootIds();
              return roots[roots.indexOf(target) + direction];
            },
            { target, direction },
          );
          await expect(
            page.locator(`[data-block-id="${inserted}"] [data-block-content]`).first(),
          ).toBeFocused();
        }
      }
    });
  }
}

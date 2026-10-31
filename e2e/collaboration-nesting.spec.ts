import { expect, test, type Page } from "@playwright/test";
import type { ReactEditorApi } from "@chulane/rivto-react";

type SyncWindow = Window & {
  __rivtoSync: { left: { reactEditor: ReactEditorApi } };
};

for (const mode of ["Page", "Edgeless"] as const) {
  for (const repeat of [0, 200]) {
    test(`remote block highlights exclude descendants in ${mode}, repeat=${repeat}`, async ({
      page,
    }) => {
      await page.goto(`/?sync=1&repeat=${repeat}&room=nested-presence-${crypto.randomUUID()}`);
      const left = page.locator('[data-editor-sync="left"]');
      const right = page.locator('[data-editor-sync="right"]');
      await expect(right.locator("[data-block-content]")).toHaveCount(2 + repeat);
      const ids = await page.evaluate(() => {
        const editor = (window as unknown as SyncWindow).__rivtoSync.left.reactEditor;
        const [parent, child] = editor.blocks.getRootIds();
        editor.blocks.moveBlock(child!, parent!, "inside");
        const grandchild = editor.blocks.insertBlock({
          type: "paragraph",
          content: "Grandchild",
        }).id;
        const sibling = editor.blocks.insertBlock({ type: "paragraph", content: "Sibling" }).id;
        editor.blocks.moveBlock(grandchild, child!, "inside");
        editor.blocks.moveBlock(sibling, parent!, "inside");
        const outside = editor.blocks.insertBlock({ type: "paragraph", content: "Outside" }).id;
        editor.blocks.moveBlock(outside, parent!, "after");
        return [parent!, child!, grandchild, sibling, outside];
      });
      await expect(
        right.locator(`[data-block-id="${ids[0]}"] [data-block-id="${ids[1]}"]`),
      ).toHaveCount(1);
      await expect(right.locator("[data-block-content]")).toHaveCount(5 + repeat);
      if (mode === "Edgeless") {
        await left.getByRole("button", { name: mode, exact: true }).click();
        await right.getByRole("button", { name: mode, exact: true }).click();
      }
      await left.locator("[data-block-content]").first().click();
      await expect(page.locator('[data-collaboration-kind="caret"]')).toHaveCount(1);
      // Only explicitly selected children may join their parent decoration.
      for (const groups of [
        [[ids[0]!]],
        [[ids[1]!]],
        [[ids[0]!, ids[1]!]],
        [[ids[0]!], [ids[2]!]],
        [[ids[1]!], [ids[3]!]],
        [[ids[2]!], [ids[3]!]],
        [ids.slice(0, 4)],
        [ids.slice(0, 4), [ids[4]!]],
        [[ids[3]!], [ids[4]!]],
      ]) {
        const selectedIds = groups.flat();
        await page.evaluate((selectedIds) => {
          const panel = (
            window as unknown as SyncWindow
          ).__rivtoSync.left.reactEditor.panels.getActive()!;
          panel.selection.set({
            type: "selection",
            blocks: selectedIds.map((id) => ({ id, start: 0, end: -1 })),
            anchorBlockId: selectedIds[0]!,
            focusBlockId: selectedIds.at(-1)!,
          });
        }, selectedIds);
        await expectHighlights(page, groups);
      }
    });
  }
}

/**
 * Checks that each consecutive group has one outline covering exactly its own rows.
 *
 * @param page - Demo page with two synchronized editors.
 * @param groups - Ordered groups of selected IDs; gaps must remain separate.
 * @returns Resolves after the remote overlay matches the measured row unions.
 */
async function expectHighlights(page: Page, groups: string[][]): Promise<void> {
  const highlights = page.locator('[data-collaboration-kind="object"]');
  await expect(highlights).toHaveCount(groups.length);
  for (const [index, ids] of groups.entries()) {
    await expect
      .poll(async () => {
        const rows = await Promise.all(
          ids.map((id) =>
            page
              .locator(`[data-editor-sync="right"] [data-block-id="${id}"] > .rivto-block-row`)
              .boundingBox(),
          ),
        );
        const x = Math.min(...rows.map((row) => row!.x));
        const y = Math.min(...rows.map((row) => row!.y));
        const expected = {
          x,
          y,
          width: Math.max(...rows.map((row) => row!.x + row!.width)) - x,
          height: Math.max(...rows.map((row) => row!.y + row!.height)) - y,
        };
        const actual = await highlights.nth(index).boundingBox();
        return Math.max(
          ...(["x", "y", "width", "height"] as const).map((key) =>
            Math.abs(actual![key] - expected[key]),
          ),
        );
      })
      .toBeLessThan(1);
  }
}

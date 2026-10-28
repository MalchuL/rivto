import { expect, test } from "@playwright/test";
import type { ReactEditorApi } from "@chulane/rivto-react";

type Host = {
  __rivtoDemo: { reactEditor: ReactEditorApi };
  parentOutlineCalls: Array<{ parent: string; ids: readonly string[] }>;
};

for (const mode of ["block", "edgeless"] as const) {
  for (const key of ["Tab", "Shift+Tab", "Enter", "Backspace"] as const) {
    test(`parent intercepts ${key} once in ${mode}, preserving content and selection`, async ({
      page,
    }) => {
      await page.goto("/?test_features=1");
      await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
      const fixture = await page.evaluate(() => {
        const host = window as unknown as Host;
        const editor = host.__rivtoDemo.reactEditor;
        const parent = editor.blocks.insertBlock({
          type: "paragraph",
          content: "Parent",
          children: [
            { type: "paragraph", content: "Previous" },
            { type: "paragraph", content: "" },
          ],
        });
        editor.load({ ...editor.dump(), blocks: [parent], elements: [], rootElementIds: [] });
        host.parentOutlineCalls = [];
        editor.blockBehaviors.register({
          /**
           * Selects only the seeded parent, independently of native block type.
           *
           * @param context - Current candidate block fields.
           * @returns Whether the candidate is the seeded parent.
           */
          isAvailable: ({ block }) => block.id === parent.id,
          /**
           * Records and rejects the complete group before child indent runs.
           *
           * @param context - Parent operation context.
           * @param ids - Requested child group.
           * @returns Rejected without mutation.
           */
          onChildIndent(context, ids) {
            host.parentOutlineCalls.push({ parent: context.block.id, ids: [...ids] });
            return "rejected";
          },
          /**
           * Records and rejects outdent from keyboard, Enter or Backspace.
           *
           * @param context - Parent operation context.
           * @param ids - Requested child group.
           * @returns Rejected without mutation.
           */
          onChildOutdent(context, ids) {
            host.parentOutlineCalls.push({ parent: context.block.id, ids: [...ids] });
            return "rejected";
          },
        });
        editor.history.clear();
        return {
          parent: parent.id,
          child: parent.children[1]!.id,
          blocks: editor.blocks.getBlocks(),
        };
      });
      if (mode === "edgeless") {
        await page.locator('[data-editor-mode="edgeless"]').click();
      }
      const content = page
        .locator(`[data-block-id="${fixture.child}"] [data-block-content]`)
        .first();
      await content.click();
      await page.keyboard.press("Home");
      const selection = await page.evaluate(() => {
        const editor = (window as unknown as Host).__rivtoDemo.reactEditor;
        const panel = editor.panels.getActive()!;
        panel.selection.set(panel.selection.readDOM()!);
        return panel.selection.get();
      });
      expect(selection?.focusBlockId).toBe(fixture.child);
      await page.keyboard.press(key);
      await expect
        .poll(() => page.evaluate(() => (window as unknown as Host).parentOutlineCalls))
        .toEqual([{ parent: fixture.parent, ids: [fixture.child] }]);
      const after = await page.evaluate(() => {
        const editor = (window as unknown as Host).__rivtoDemo.reactEditor;
        return { blocks: editor.blocks.getBlocks(), selection: editor.selection.get() };
      });
      expect(after.blocks).toEqual(fixture.blocks);
      expect(after.selection).toEqual(selection);
      await expect(content).toBeFocused();
    });
  }
}

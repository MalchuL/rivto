import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";
import type { ReactEditorApi } from "../packages/react-rivto-editor/src/editor/types";

for (const outcome of ["unhandled", "handled"] as const) {
  test(`shared structural deletion runs once across types and ${outcome} controls deletion`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator('[data-journal-document="today"] [data-block-content]').first().click();
    const ids = await page.evaluate((outcome) => {
      const host = window as unknown as {
        __rivtoDemo: { editor: DocumentEditorAPI; reactEditor: ReactEditorApi };
        behaviorDeleteCalls: string[][];
      };
      const { editor, reactEditor } = host.__rivtoDemo;
      const paragraph = editor.blocks.getBlocks().find((block) => block.type === "paragraph")!;
      const board = editor.blocks.getBlocks().find((block) => block.type === "columns")!;
      const [left, right] = board.children;
      const child = right!.children[0]!;
      host.behaviorDeleteCalls = [];
      reactEditor.blockBehaviors.register(
        {
          isAvailable: () => true,
          /** @param context - Selected block context. @param selected - Entire structural selection. @returns Configured claim outcome. */
          onStructuralDelete(context, selected) {
            host.behaviorDeleteCalls.push([...selected]);
            return outcome;
          },
        },
        100,
      );
      const selected = [paragraph.id, right!.id];
      editor.history.clear();
      editor.selection.set({
        type: "selection",
        blocks: selected.map((id) => ({ id, start: 0, end: -1 })),
        anchorBlockId: selected[0]!,
        focusBlockId: selected[1]!,
      });
      const panel = reactEditor.panels.getActive() ?? reactEditor.panels.getDefault();
      panel!.events.getRoot()!.focus();
      return { selected, left: left!.id, child: child.id, childContent: child.content };
    }, outcome);
    await page.keyboard.press("Delete");
    const read = () =>
      page.evaluate(({ selected, child }) => {
        const host = window as unknown as {
          __rivtoDemo: { editor: DocumentEditorAPI };
          behaviorDeleteCalls: string[][];
        };
        const { editor } = host.__rivtoDemo;
        return {
          calls: host.behaviorDeleteCalls,
          present: selected.map((id) => editor.blocks.hasBlock(id)),
          parent: editor.blocks.getParentId(child),
          content: editor.blocks.getBlockNode(child)?.content,
        };
      }, ids);
    await expect.poll(read).toEqual({
      calls: [ids.selected],
      present: outcome === "unhandled" ? [false, false] : [true, true],
      parent: outcome === "unhandled" ? ids.left : ids.selected[1],
      content: ids.childContent,
    });
    if (outcome === "unhandled") {
      await page.keyboard.press("Control+z");
      await expect.poll(async () => (await read()).present).toEqual([true, true]);
      await expect.poll(async () => (await read()).parent).toBe(ids.selected[1]);
    }
  });
}

for (const count of [1, 200]) {
  test(`structural deletion avoids repeated behavior snapshots for ${count} blocks`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator('[data-journal-document="today"] [data-block-content]').first().click();
    const ids = await page.evaluate((count) => {
      const host = window as unknown as {
        __rivtoDemo: { editor: DocumentEditorAPI; reactEditor: ReactEditorApi };
        behaviorSnapshotReads: number;
      };
      const { editor, reactEditor } = host.__rivtoDemo;
      const ids = editor.history.batchUpdates(() =>
        Array.from(
          { length: count },
          (value, index) =>
            editor.blocks.insertBlock({ type: "paragraph", content: `delete ${index}` }).id,
        ),
      );
      const panel = (reactEditor.panels.getActive() ?? reactEditor.panels.getDefault())!;
      let snapshots = 0;
      const getBlock = panel.blocks.getBlock.bind(panel.blocks);
      panel.blocks.getBlock = (...args) => {
        snapshots++;
        return getBlock(...args);
      };
      const deleteSelection = panel.selection.delete.bind(panel.selection);
      panel.selection.delete = () => {
        host.behaviorSnapshotReads = snapshots;
        return deleteSelection();
      };
      editor.history.clear();
      editor.selection.set({
        type: "selection",
        blocks: ids.map((id) => ({ id, start: 0, end: -1 })),
        anchorBlockId: ids[0]!,
        focusBlockId: ids.at(-1)!,
      });
      panel.events.getRoot()!.focus();
      snapshots = 0;
      return ids;
    }, count);
    await page.keyboard.press("Delete");
    const state = await page.evaluate((ids) => {
      const host = window as unknown as {
        __rivtoDemo: { editor: DocumentEditorAPI };
        behaviorSnapshotReads: number;
      };
      return {
        reads: host.behaviorSnapshotReads,
        remaining: ids.filter((id) => host.__rivtoDemo.editor.blocks.hasBlock(id)),
      };
    }, ids);
    expect(state.remaining).toEqual([]);
    expect(state.reads).toBeGreaterThan(0);
    expect(state.reads).toBeLessThanOrEqual(3);
    await page.keyboard.press("Control+z");
    await expect
      .poll(() =>
        page.evaluate(
          (ids) =>
            ids.every((id) =>
              (
                window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
              ).__rivtoDemo.editor.blocks.hasBlock(id),
            ),
          ids,
        ),
      )
      .toBe(true);
  });
}

test("availability uses current properties independently for blocks of the same native type", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
  const ids = await page.evaluate(() => {
    const { editor, reactEditor } = (
      window as unknown as {
        __rivtoDemo: { editor: DocumentEditorAPI; reactEditor: ReactEditorApi };
      }
    ).__rivtoDemo;
    reactEditor.blockBehaviors.register({
      isAvailable: (context) => context.block.props.hideChildren === true,
      childrenVisible: () => false,
    });
    const beforeId = editor.blocks.getRootIds()[0];
    const first = editor.blocks.insertBlock(
      {
        type: "paragraph",
        content: "First parent",
        children: [{ type: "paragraph", content: "First child" }],
      },
      { parentId: null, beforeId },
    );
    const second = editor.blocks.insertBlock(
      {
        type: "paragraph",
        content: "Second parent",
        children: [{ type: "paragraph", content: "Second child" }],
      },
      { parentId: null, beforeId },
    );
    editor.history.clear();
    return {
      first: first.id,
      firstChild: first.children[0]!.id,
      secondChild: second.children[0]!.id,
    };
  });
  const today = page.locator('[data-journal-document="today"]');
  const firstChild = today.locator(`[data-block-id="${ids.firstChild}"]`);
  const secondChild = today.locator(`[data-block-id="${ids.secondChild}"]`);
  await expect(firstChild).toHaveCount(1);
  await expect(secondChild).toHaveCount(1);
  await page.evaluate(
    (id) =>
      (
        window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
      ).__rivtoDemo.editor.blocks.updateBlock(id, { props: { hideChildren: true } }),
    ids.first,
  );
  await expect(firstChild).toHaveCount(0);
  await expect(secondChild).toHaveCount(1);
  await page.evaluate(
    (id) =>
      (
        window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
      ).__rivtoDemo.editor.blocks.updateBlock(id, { props: { hideChildren: false } }),
    ids.first,
  );
  await expect(firstChild).toHaveCount(1);
  await expect(secondChild).toHaveCount(1);
});

for (const mode of ["block", "edgeless"] as const) {
  for (const gesture of ["indent", "outdent", "reorder", "drag"] as const) {
    test(`semantic move veto preserves state for ${gesture} in ${mode}`, async ({ page }) => {
      await page.goto("/");
      const ids = await page.evaluate(
        ({ mode, gesture }) => {
          const host = window as unknown as {
            __rivtoDemo: { editor: DocumentEditorAPI; reactEditor: ReactEditorApi };
            allowBehaviorMove: boolean;
            behaviorMoveChecks: number;
          };
          const { editor, reactEditor } = host.__rivtoDemo;
          const parent = editor.blocks.insertBlock({
            type: "paragraph",
            content: "Parent",
            props: { moveRestricted: gesture === "indent" },
            children:
              gesture === "outdent"
                ? [
                    { type: "paragraph", content: "Source", props: { moveRestricted: true } },
                    { type: "paragraph", content: "Tail" },
                  ]
                : [],
          });
          const source =
            gesture === "outdent"
              ? parent.children[0]!
              : editor.blocks.insertBlock({
                  type: "paragraph",
                  content: "Source",
                  props: { moveRestricted: gesture !== "indent" },
                });
          const blocks = gesture === "outdent" ? [parent] : [parent, source];
          editor.load({ ...editor.dump(), rootElementIds: [], blocks, elements: [] });
          if (mode === "edgeless") {
            editor.elements.insertElement({
              type: "block",
              zIndex: 0,
              frame: { x: 20, y: 20, width: 900, height: 600 },
              props: { startBlockId: parent.id, endBlockId: blocks.at(-1)!.id },
            });
          }
          host.allowBehaviorMove = false;
          host.behaviorMoveChecks = 0;
          reactEditor.blockBehaviors.register({
            isAvailable: ({ block }) => block.props.moveRestricted === true,
            canMove: () => {
              host.behaviorMoveChecks++;
              return host.allowBehaviorMove;
            },
          });
          editor.history.clear();
          return { source: source.id, parent: parent.id, blocks };
        },
        { mode, gesture },
      );
      if (mode === "edgeless") {
        await page.locator('[data-editor-mode="edgeless"]').click();
      }
      const source = page.locator(`[data-block-id="${ids.source}"]`).first();
      const content = source.locator(":scope > .page-block-row [data-block-content]").first();
      await content.click();
      await page.keyboard.press("End");
      const selection = await page.evaluate(() => {
        const { editor, reactEditor } = (
          window as unknown as {
            __rivtoDemo: { editor: DocumentEditorAPI; reactEditor: ReactEditorApi };
          }
        ).__rivtoDemo;
        const panel = (reactEditor.panels.getActive() ?? reactEditor.panels.getDefault())!;
        const current = panel.selection.readDOM()!;
        editor.selection.set(current);
        return editor.selection.snapshot();
      });
      expect(selection?.focusBlockId).toBe(ids.source);
      const perform = async () => {
        if (gesture !== "drag") {
          const keys = { indent: "Tab", outdent: "Shift+Tab", reorder: "Alt+Shift+ArrowUp" };
          await page.keyboard.press(keys[gesture]);
          return;
        }
        await source.locator(":scope > .page-block-row").hover();
        const handle = source.locator(":scope > .page-block-row .block-handle");
        await handle.hover();
        const from = (await handle.boundingBox())!;
        const target = (await page
          .locator(`[data-block-id="${ids.parent}"]`)
          .first()
          .boundingBox())!;
        await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
        await page.mouse.down();
        await page.mouse.move(from.x + 8, from.y + 8, { steps: 3 });
        await page.mouse.move(target.x + 12, target.y + 1, { steps: 15 });
        await page.mouse.up();
      };
      const state = () =>
        page.evaluate(() => {
          const host = window as unknown as {
            __rivtoDemo: { editor: DocumentEditorAPI };
            behaviorMoveChecks: number;
          };
          return {
            blocks: host.__rivtoDemo.editor.blocks.getBlocks(),
            selection: host.__rivtoDemo.editor.selection.snapshot(),
            checks: host.behaviorMoveChecks,
          };
        });
      await perform();
      await expect.poll(async () => (await state()).checks).toBeGreaterThan(0);
      expect((await state()).blocks).toEqual(ids.blocks);
      if (gesture !== "drag") {
        expect((await state()).selection).toEqual(selection);
      }
      await page.evaluate(() => {
        (window as unknown as { allowBehaviorMove: boolean }).allowBehaviorMove = true;
      });
      await perform();
      await expect.poll(async () => (await state()).blocks).not.toEqual(ids.blocks);
      const moved = await page.evaluate((ids) => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        return {
          roots: editor.blocks.getRootIds(),
          parent: editor.blocks.getParentId(ids.source),
          content: editor.blocks.getBlockNode(ids.source)?.content,
        };
      }, ids);
      expect(moved.content).toBe("Source");
      expect(moved.parent).toBe(gesture === "indent" ? ids.parent : null);
      if (gesture === "reorder" || gesture === "drag") {
        expect(moved.roots).toEqual([ids.source, ids.parent]);
      }
      await page.evaluate(() =>
        (
          window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
        ).__rivtoDemo.editor.history.undo(),
      );
      await expect.poll(async () => (await state()).blocks).toEqual(ids.blocks);
    });
  }
}

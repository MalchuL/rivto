import { createCaretSelection } from "@chulane/rivto";
import { splitBlock } from "../../block-behaviors/utils/text-ops";
import { createBlockBehaviorContext } from "../../block-behaviors/utils/context";
import { firstKeyboardTarget } from "../events/selection";
import { defaultWritingBlockExtension } from "../../extensions/built-ins/built-ins";
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";

test("custom onSplit owns continuation properties and is released with its extension", async () => {
  const originalFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (() => 1) as typeof requestAnimationFrame;
  const core = await createTestCoreEditor({ registerWritingBlock: false });
  const editor = createTestReactEditor({
    editor: core,
    extensions: [defaultWritingBlockExtension()],
  });
  try {
    const remove = editor.editor.extensions.install({
      id: "custom.list",
      setup: (runtime) => {
        runtime.blockListProps.register({
          id: "custom.list",
          defaults: { hidden: false, sequence: 0 },
          isValid: (value) =>
            typeof value.hidden === "boolean" && typeof value.sequence === "number",
        });
        return runtime.blockBehaviors.register({
          isAvailable: () => true,
          childrenVisible: (block) => !block.listProps.hidden,
          /**
           * Splits with the custom list sequence incremented and the new block visible.
           *
           * @param context - Source subtree and live panel; caller owns the transaction.
           * @param target - Caret determining the text split offset.
           * @returns Handled after the shared split algorithm completes.
           * @throws If delegated block mutation or list-property validation fails.
           */
          onSplit: (context, target) =>
            splitBlock(context, target, {
              hidden: false,
              sequence: Number(context.block.listProps.sequence) + 1,
            }),
        });
      },
    });
    const block = editor.editor.blocks.insertBlock({
      type: "paragraph",
      content: "abcd",
      listProps: { hidden: true, sequence: 7 },
    });
    expect(editor.editor.blockBehaviors.childrenVisible(block)).toBe(false);
    core.history.clear();
    /**
     * Dispatches Enter at the middle of the restored source block.
     *
     * @returns The new block selected by the applicable onSplit handler.
     */
    const pressEnter = () => {
      const selection = createCaretSelection(block.id, 2);
      const context = createBlockBehaviorContext(editor, block.id, {} as HTMLElement, selection)!;
      core.history.batchUpdates(() =>
        editor.editor.blockBehaviors.dispatch("onSplit", context, firstKeyboardTarget(selection)!),
      );
      return editor.blocks.getBlock(editor.selection.snapshot()!.focusBlockId!)!;
    };
    const next = pressEnter();
    expect(editor.editor.blocks.getBlockNode(block.id)?.content).toBe("ab");
    expect(next.content).toBe("cd");
    expect(next.listProps).toMatchObject({ hidden: false, sequence: 8 });
    core.history.undo();
    expect(editor.editor.blocks.getBlockNode(block.id)?.content).toBe("abcd");
    expect(editor.editor.blocks.hasBlock(next.id)).toBe(false);
    remove();
    expect(editor.editor.blockBehaviors.childrenVisible(block)).toBe(true);
    const withoutExtension = pressEnter();
    expect(withoutExtension.content).toBe("cd");
    expect(withoutExtension.listProps).toEqual({});
  } finally {
    editor.editor.destroy();
    core.destroy();
    globalThis.requestAnimationFrame = originalFrame;
  }
});

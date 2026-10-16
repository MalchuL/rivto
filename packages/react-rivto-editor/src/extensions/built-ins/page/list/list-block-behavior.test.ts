import { CheckboxBlockBehavior } from "./checkbox-block-behavior";
import { NumberedListBlockBehavior } from "./numbered-list-block-behavior";
import { ListBlockBehavior } from "./list-block-behavior";
import { defaultWritingBlockExtension, listShortcutsExtension } from "../../built-ins";
import { createTestCoreEditor, createTestReactEditor } from "../../../../test-utils";
import { createBlockFactory } from "../../../../block-factories";
import { createCaretSelection } from "@chulane/rivto";
import { createBlockBehaviorContext } from "../../../../block-behaviors/utils/context";
import { firstKeyboardTarget } from "../../../../managers/events/selection";

const originalFrame = globalThis.requestAnimationFrame;
beforeEach(() => {
  globalThis.requestAnimationFrame = (() => 1) as typeof requestAnimationFrame;
});
afterEach(() => {
  globalThis.requestAnimationFrame = originalFrame;
});

const modes = [
  "list",
  "checkbox",
  "numbered_list",
  "start_numbered_list",
  "continue_numbered_list",
  undefined,
] as const;

test.each([...modes, "unknown"])(
  "list behaviors select exactly one owner for marker %s",
  async (type) => {
    const core = await createTestCoreEditor({ registerWritingBlock: false });
    const panel = createTestReactEditor({
      editor: core,
      extensions: [defaultWritingBlockExtension()],
    });
    const block = panel.blocks.insertBlock({ type: "paragraph", content: "text" });
    const behaviors = [
      new CheckboxBlockBehavior(),
      new NumberedListBlockBehavior(),
      new ListBlockBehavior(),
    ];
    const selected = behaviors.map((behavior) =>
      behavior.isAvailable({
        editor: panel.editor,
        block: { ...block, listProps: { type } },
      }),
    );
    const checkbox = type === "checkbox";
    const numbered =
      type === "numbered_list" ||
      type === "start_numbered_list" ||
      type === "continue_numbered_list";
    expect(selected).toEqual([checkbox, numbered, !checkbox && !numbered]);
    panel.editor.destroy();
    core.destroy();
  },
);

test.each(
  modes.flatMap((type) => (["block", "edgeless"] as const).map((mode) => ({ type, mode }))),
)(
  "onSplit inherits marker $type in $mode, overrides factory list properties, and remains undoable",
  async ({ type, mode }) => {
    const core = await createTestCoreEditor({ registerWritingBlock: false });
    const factory = {
      ...createBlockFactory("paragraph"),
      /** @returns Writing input with intentional list overrides that split policy must replace. */
      createEmptyBlock: () => ({
        type: "paragraph",
        content: "",
        listProps: { type: "checkbox", checked: true, factoryOnly: true },
      }),
    };
    const panel = createTestReactEditor({
      editor: core,
      extensions: [defaultWritingBlockExtension({ factory }), listShortcutsExtension()],
    });
    panel.mode.set(mode);
    const inserted = panel.blocks.insertBlock({
      type: "paragraph",
      content: "abcd",
      listProps: { type: type ?? "list", checked: true, custom: "keep" },
    });
    if (type === undefined) {
      panel.blocks.deleteListProps(inserted.id, ["type", "checked"]);
    }
    const source = panel.blocks.getBlock(inserted.id)!;
    core.history.clear();
    const selection = createCaretSelection(source.id, 2);
    const context = createBlockBehaviorContext(panel, source.id, {} as HTMLElement, selection)!;
    expect(
      core.history.batchUpdates(() =>
        panel.editor.blockBehaviors.dispatch("onSplit", context, firstKeyboardTarget(selection)!),
      ),
    ).toBe(true);
    const next = panel.blocks.getBlock(panel.selection.snapshot()!.focusBlockId!)!;
    expect(next.id).not.toBe(source.id);
    expect(panel.selection.snapshot()).toMatchObject(createCaretSelection(next.id, 0));
    let expectedType = "list";
    if (type === "checkbox") {
      expectedType = "checkbox";
    } else if (type && type !== "list") {
      expectedType = "numbered_list";
    }
    expect(panel.blocks.getBlockNode(source.id)?.content).toBe("ab");
    expect(panel.blocks.getBlockNode(source.id)?.listProps).toEqual(source.listProps);
    expect(next.content).toBe("cd");
    expect(next.listProps).toEqual({ type: expectedType, checked: false });
    core.history.undo();
    expect(panel.blocks.getBlock(source.id)).toEqual(source);
    expect(panel.blocks.hasBlock(next.id)).toBe(false);
    panel.editor.destroy();
    core.destroy();
  },
);

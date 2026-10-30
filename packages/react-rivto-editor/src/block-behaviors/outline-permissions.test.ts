import { createCaretSelection } from "@chulane/rivto";
import { defaultWritingBlockExtension } from "../extensions/built-ins/built-ins";
import {
  createTestCoreEditor,
  createTestReactEditor,
  indentBlocks,
  outdentBlocks,
} from "../test-utils";

test("indent permissions work without dragging and preserve selection and undo", async () => {
  const core = await createTestCoreEditor({ registerWritingBlock: false });
  const panel = createTestReactEditor({
    editor: core,
    extensions: [defaultWritingBlockExtension()],
  });
  try {
    const first = core.blocks.insertBlock({ type: "paragraph", content: "First" });
    const second = core.blocks.insertBlock({ type: "paragraph", content: "Second" });
    const selection = createCaretSelection(second.id, 2);
    panel.selection.set(selection);
    const beforeSelection = panel.selection.snapshot();
    core.history.clear();
    const calls: string[][] = [];
    const release = panel.editor.blockBehaviors.register({
      isAvailable: () => true,
      canMove: (context) => {
        calls.push(context.sources.map((source) => source.id));
        expect(context.parent?.id).toBe(first.id);
        expect(context.destination).toEqual({ parentId: first.id });
        return false;
      },
    });
    const forest = core.blocks.getBlocks;
    core.blocks.getBlocks = () => {
      throw new Error("permission must not read a forest");
    };
    indentBlocks(panel, [second.id]);
    core.blocks.getBlocks = forest;
    expect(calls).toEqual([[second.id]]);
    expect(core.blocks.getRootIds()).toEqual([first.id, second.id]);
    expect(panel.selection.snapshot()).toEqual(beforeSelection);
    core.history.undo();
    expect(panel.selection.snapshot()).toEqual(beforeSelection);
    release();
    indentBlocks(panel, [second.id]);
    expect(core.blocks.getParentId(second.id)).toBe(first.id);
    expect(core.blocks.getBlockNode(second.id)?.content).toBe("Second");
    expect(panel.selection.snapshot()).toEqual(beforeSelection);
    core.history.undo();
    expect(core.blocks.getRootIds()).toEqual([first.id, second.id]);
  } finally {
    panel.editor.destroy();
    core.destroy();
  }
});

test.each(["lift", "tail"])(
  "outdent preflights %s before mutating either placement",
  async (veto) => {
    const core = await createTestCoreEditor({ registerWritingBlock: false });
    const panel = createTestReactEditor({
      editor: core,
      extensions: [defaultWritingBlockExtension()],
    });
    try {
      const parent = core.blocks.insertBlock({
        type: "paragraph",
        content: "Parent",
        children: [
          { type: "paragraph", content: "Lift" },
          { type: "paragraph", content: "Tail" },
        ],
      });
      const [lift, tail] = parent.children;
      const next = core.blocks.insertBlock({ type: "paragraph", content: "Next" });
      const selection = createCaretSelection(lift!.id, 1);
      panel.selection.set(selection);
      const beforeSelection = panel.selection.snapshot();
      core.history.clear();
      const calls: Array<{ ids: string[]; parentId: string | null; beforeId?: string }> = [];
      const release = panel.editor.blockBehaviors.register({
        isAvailable: () => true,
        canMove: ({ sources, destination }) => {
          calls.push({ ids: sources.map((source) => source.id), ...destination });
          return sources[0]?.id !== (veto === "lift" ? lift!.id : tail!.id);
        },
      });
      outdentBlocks(panel, [lift!.id]);
      expect(calls[0]).toEqual({ ids: [lift!.id], parentId: null, beforeId: next.id });
      if (veto === "tail") {
        expect(calls[1]).toEqual({ ids: [tail!.id], parentId: lift!.id });
      }
      expect(core.blocks.getBlock(parent.id)).toEqual(parent);
      expect(core.blocks.getRootIds()).toEqual([parent.id, next.id]);
      expect(panel.selection.snapshot()).toEqual(beforeSelection);
      core.history.undo();
      expect(panel.selection.snapshot()).toEqual(beforeSelection);
      release();
      outdentBlocks(panel, [lift!.id]);
      expect(core.blocks.getRootIds()).toEqual([parent.id, lift!.id, next.id]);
      expect(core.blocks.getParentId(tail!.id)).toBe(lift!.id);
      expect(panel.selection.snapshot()).toEqual(beforeSelection);
      core.history.undo();
      expect(core.blocks.getBlock(parent.id)).toEqual(parent);
      expect(core.blocks.getRootIds()).toEqual([parent.id, next.id]);
    } finally {
      panel.editor.destroy();
      core.destroy();
    }
  },
);

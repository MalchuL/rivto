import { ChildrenPanel } from "@chulane/rivto";
import { ReactPanel } from "../../panels/react-panel";
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { PageBlockDrag } from "./page-block-drag";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("moves mixed-parent roots to actual document roots in one undo step", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const first = panel.blocks.insertBlock({ type: "paragraph", children: [{ type: "paragraph" }] });
  const second = panel.blocks.insertBlock({ type: "paragraph", children: [{ type: "paragraph" }] });
  const ids = [second.children[0]!.id, first.children[0]!.id];
  const drag = new PageBlockDrag(panel);
  const destination = { kind: "inside", parentId: null } as const;
  const before = core.blocks.getBlocks();
  expect(drag.canMove(ids, destination)).toBe(true);
  expect(core.blocks.getBlocks()).toEqual(before);
  expect(drag.moveBlocks(ids, destination)).toBe(true);
  expect(panel.blocks.getRootIds()).toEqual([first.id, second.id, ids[1], ids[0]]);
  expect(panel.selection.get()?.blocks.map(({ id }) => id)).toEqual([ids[1], ids[0]]);
  core.history.undo();
  expect(core.blocks.getBlocks()).toEqual(before);
  core.history.redo();
  expect(panel.blocks.getRootIds()).toEqual([first.id, second.id, ids[1], ids[0]]);
  panel.editor.destroy();
  core.destroy();
});

it("rechecks stale gaps, missing sources and live policy without partial changes", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const first = panel.blocks.insertBlock({ type: "paragraph" });
  const second = panel.blocks.insertBlock({ type: "paragraph" });
  let allowed = true;
  const behaviors = {
    /**
     * Reads the fixture's changing permission at feedback and commit time.
     *
     * @returns Current permission without mutating data.
     */
    canMove: () => allowed,
    /**
     * Preserves the fixture's ordinary visible outline for preview reads.
     *
     * @returns Children remain eligible for the bounded traversal.
     */
    childrenVisible: () => true,
  };
  jestApi.spyOn(panel.editor.blockBehaviors, "canMove").mockImplementation(behaviors.canMove);
  jestApi
    .spyOn(panel.editor.blockBehaviors, "childrenVisible")
    .mockImplementation(behaviors.childrenVisible);
  const drag = new PageBlockDrag(panel);
  const gap = { kind: "between", parentId: null, previousId: second.id, nextId: null } as const;
  expect(drag.canMove([first.id], gap)).toBe(true);
  allowed = false;
  expect(drag.moveBlocks([first.id], gap)).toBe(false);
  allowed = true;
  panel.blocks.insertBlock({ type: "paragraph" });
  const before = core.blocks.getBlocks();
  expect(drag.moveBlocks([first.id], gap)).toBe(false);
  expect(drag.moveBlocks([first.id, "missing"], { kind: "inside", parentId: second.id })).toBe(
    false,
  );
  expect(core.blocks.getBlocks()).toEqual(before);
  panel.editor.destroy();
  core.destroy();
});

it("preserves protected panel roots and rejects cycles while allowing their child list", async () => {
  const core = await createTestCoreEditor();
  const owner = createTestReactEditor({ editor: core });
  const root = core.blocks.insertBlock({
    type: "paragraph",
    children: [{ type: "paragraph", children: [{ type: "paragraph" }] }, { type: "paragraph" }],
  });
  const panel = new ReactPanel(owner.editor, new ChildrenPanel(core, { rootBlockId: root.id }));
  const drag = new PageBlockDrag(panel);
  const parent = root.children[0]!;
  const child = parent.children[0]!;
  expect(drag.canMove([root.id], { kind: "inside", parentId: null })).toBe(false);
  expect(drag.canMove([child.id], { kind: "inside", parentId: null })).toBe(false);
  expect(drag.canMove([parent.id], { kind: "inside", parentId: child.id })).toBe(false);
  expect(drag.moveBlocks([child.id], { kind: "inside", parentId: root.id })).toBe(true);
  expect(panel.blocks.getRootIds()).toEqual([parent.id, root.children[1]!.id, child.id]);
  panel.destroy();
  owner.editor.destroy();
  core.destroy();
});

it.each([4, 200])(
  "bounds preview reads in a %i-child subtree and never reads recursive snapshots",
  async (count) => {
    const core = await createTestCoreEditor();
    const panel = createTestReactEditor({ editor: core });
    const root = panel.blocks.insertBlock({
      type: "paragraph",
      content: "Root",
      children: Array.from({ length: count }, (_, index) => ({
        type: "paragraph",
        content: `Child ${index}`,
      })),
    });
    const recursive = jestApi.spyOn(panel.blocks, "getBlock");
    const reads = jestApi.spyOn(panel.blocks, "getBlockNode");
    const drag = new PageBlockDrag(panel);
    try {
      expect(drag.getPreview([root.id], 4)).toEqual([
        { text: "Root", depth: 0 },
        { text: "Child 0", depth: 1 },
        { text: "Child 1", depth: 1 },
        { text: "Child 2", depth: 1 },
      ]);
      expect(reads).toHaveBeenCalledTimes(4);
      expect(recursive).not.toHaveBeenCalled();
      reads.mockClear();
      expect(
        drag.getPreview(
          Array.from({ length: 200 }, (_, index) => `missing-${index}`),
          4,
        ),
      ).toEqual([]);
      expect(reads).toHaveBeenCalledTimes(4);
    } finally {
      panel.editor.destroy();
      core.destroy();
    }
  },
);

it("respects live child visibility, truncates text, and keeps preview read-only", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = panel.blocks.insertBlock({
    type: "paragraph",
    content: "x".repeat(1000),
    children: [{ type: "paragraph", content: "Hidden" }],
  });
  const next = panel.blocks.insertBlock({ type: "paragraph", content: "Next" });
  const visibility = jestApi
    .spyOn(panel.editor.blockBehaviors, "childrenVisible")
    .mockReturnValue(false);
  const drag = new PageBlockDrag(panel);
  core.history.clear();
  const before = core.blocks.getBlocks();
  try {
    expect(drag.getPreview([root.id, next.id], 4)).toEqual([
      { text: "x".repeat(240), depth: 0 },
      { text: "Next", depth: 0 },
    ]);
    expect(visibility).toHaveBeenCalledTimes(1);
    expect(core.blocks.getBlocks()).toEqual(before);
    expect(panel.selection.get()).toBeUndefined();
    visibility.mockReturnValue(true);
    expect(drag.getPreview([root.id], 4)[1]).toEqual({ text: "Hidden", depth: 1 });
  } finally {
    panel.editor.destroy();
    core.destroy();
  }
});

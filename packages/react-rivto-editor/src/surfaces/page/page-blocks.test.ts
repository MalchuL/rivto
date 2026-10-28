const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;
import { ChildrenPanel } from "@chulane/rivto";
import { ReactPanel } from "../../panels/react-panel";
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { PageBlocks } from "./page-blocks";

it("reuses model snapshots and addressed subscriptions without visiting descendants", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = panel.blocks.insertBlock({ type: "paragraph", children: [{ type: "paragraph" }] });
  const blocks = new PageBlocks(panel, panel.editor.blockBehaviors);
  const recursive = jestApi.spyOn(core.blocks, "getBlock");
  const first = blocks.getBlockNode(root.id)!;
  expect(blocks.getBlockNode(root.id)).toBe(first);
  expect(first.color).toBe("transparent");
  expect(first.childIds).toBe(panel.blocks.getBlockNode(root.id)!.childIds);
  expect(blocks.getRootIds()).toBe(panel.blocks.getRootIds());
  const listener = jestApi.fn();
  const release = blocks.subscribeBlockNode(root.id, listener);
  panel.blocks.updateBlock(root.children[0]!.id, { content: "Changed child" });
  expect(listener).not.toHaveBeenCalled();
  expect(blocks.getBlockNode(root.id)).toBe(first);
  const remove = panel.editor.blockBehaviors.register({
    /**
     * Selects this test's one parent without inspecting descendants.
     *
     * @param context - Current own-node behavior context.
     * @returns Whether this is the fixture parent.
     */
    isAvailable: ({ block }) => block.id === root.id,
    /**
     * Hides fixture children while the registration is installed.
     *
     * @returns False for the selected parent.
     */
    childrenVisible: () => false,
  });
  expect(listener).toHaveBeenCalledTimes(1);
  expect(blocks.getBlockNode(root.id)?.collapsed).toBe(true);
  remove();
  expect(listener).toHaveBeenCalledTimes(2);
  expect(blocks.getBlockNode(root.id)?.collapsed).toBe(false);
  expect(recursive).not.toHaveBeenCalled();
  release();
  panel.editor.destroy();
  core.destroy();
});

it("keeps hidden panel boundaries distinct from real document roots", async () => {
  const core = await createTestCoreEditor();
  const owner = createTestReactEditor({ editor: core });
  const parent = core.blocks.insertBlock({ type: "paragraph", children: [{ type: "paragraph" }] });
  const outside = core.blocks.insertBlock({ type: "paragraph" });
  const scope = new ReactPanel(owner.editor, new ChildrenPanel(core, { rootBlockId: parent.id }));
  const blocks = new PageBlocks(scope, owner.editor.blockBehaviors);
  expect(blocks.getRootIds()).toBeUndefined();
  expect(blocks.getBlockIds()).toEqual([parent.children[0]!.id]);
  expect(blocks.getParentId(parent.children[0]!.id)).toBe(parent.id);
  expect(blocks.getBlockNode(parent.id)?.childIds).toEqual(blocks.getBlockIds());
  expect(blocks.getBlockNode(outside.id)).toBeUndefined();
  expect(() => blocks.updateBlockNode(parent.id, { checked: true })).toThrow();
  scope.destroy();
  owner.editor.destroy();
  core.destroy();
});

it("prevalidates decorations and removes optional fields in one undo batch", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const node = panel.blocks.insertBlock({
    type: "paragraph",
    listProps: {
      type: "checkbox",
      checked: false,
      backgroundColor: "red",
      custom: 42,
    },
  });
  const blocks = new PageBlocks(panel, panel.editor.blockBehaviors);
  expect(blocks.getBlockNode(node.id)?.color).toBe("var(--rivto-block-red)");
  core.history.stopCapturing();
  expect(() => blocks.updateBlockNode(node.id, { checked: true, color: "unsupported" })).toThrow();
  expect(panel.blocks.getBlockNode(node.id)?.listProps.checked).toBe(false);
  blocks.updateBlockNode(node.id, { listType: null, color: null, checked: true });
  expect(panel.blocks.getBlockNode(node.id)?.listProps).toEqual({ checked: true, custom: 42 });
  expect(blocks.getBlockNode(node.id)?.color).toBe("transparent");
  core.history.undo();
  expect(panel.blocks.getBlockNode(node.id)?.listProps).toEqual(node.listProps);
  core.history.redo();
  expect(panel.blocks.getBlockNode(node.id)?.listProps).toEqual({ checked: true, custom: 42 });
  panel.editor.destroy();
  core.destroy();
});

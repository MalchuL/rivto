const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;
import { ChildrenPanel, createStructuralSelection } from "@chulane/rivto";
import { ReactPanel } from "../../panels/react-panel";
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { PageBlocks } from "./page-blocks";
import { bentoExtension } from "../../extensions/containers/bento/bento";

it("persists and removes block styles with undo, clipboard and snapshot round trips", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const node = core.blocks.insertBlock({ type: "paragraph" });
  const blocks = new PageBlocks(panel, panel.editor.blockBehaviors);
  const style = { text: { color: "#ff0000" }, border: { radius: "20px" } };
  core.history.clear();
  blocks.updateBlockNode(node.id, { style });
  expect(blocks.getBlockNode(node.id)?.style).toEqual(style);
  expect(
    core.clipboard.copy(createStructuralSelection([node.id]))?.blocks[0]?.listProps.style,
  ).toEqual(style);
  const snapshot = core.dump();
  core.history.undo();
  expect(blocks.getBlockNode(node.id)?.style).toBeUndefined();
  core.history.redo();
  expect(core.blocks.getBlockNode(node.id)?.listProps.style).toEqual(style);
  core.load(snapshot);
  expect(blocks.getBlockNode(node.id)?.style).toEqual(style);
  blocks.updateBlockNode(node.id, { style: null });
  expect(core.blocks.getBlockNode(node.id)?.listProps.style).toBeUndefined();
  panel.editor.destroy();
  core.destroy();
});

it("keeps unrelated styles when one persisted field has the wrong type", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const style = {
    background: { color: "#123456" },
    text: { color: "#0000ff", fontSize: 123 },
    future: true,
  };
  const node = core.blocks.insertBlock({ type: "paragraph", listProps: { style } });
  const blocks = new PageBlocks(panel, panel.editor.blockBehaviors);
  expect(blocks.getBlockNode(node.id)?.style).toEqual(style);
  panel.editor.destroy();
  core.destroy();
});

it("projects ordinary and container backgrounds without the background menu extension", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core, extensions: [bentoExtension()] });
  const paragraph = core.blocks.insertBlock({
    type: "paragraph",
    listProps: { style: { background: { color: "#ff000080" } } },
  });
  const container = core.blocks.insertBlock({ type: "bento" });
  const blocks = new PageBlocks(panel, panel.editor.blockBehaviors);
  expect(blocks.getBlockNode(paragraph.id)?.style?.background?.color).toBe("#ff000080");
  expect(blocks.getBlockNode(container.id)?.style?.background?.color).toBe("#eceef6");
  panel.editor.destroy();
  core.destroy();
});

it("reuses model snapshots and addressed subscriptions without visiting descendants", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = panel.blocks.insertBlock({ type: "paragraph", children: [{ type: "paragraph" }] });
  const blocks = new PageBlocks(panel, panel.editor.blockBehaviors);
  const recursive = jestApi.spyOn(core.blocks, "getBlock");
  const first = blocks.getBlockNode(root.id)!;
  expect(blocks.getBlockNode(root.id)).toBe(first);
  expect(first.style).toBeUndefined();
  expect(first.dropPlacement).toBeUndefined();
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
    childDropPlacement: () => "siblings",
  });
  expect(listener).toHaveBeenCalledTimes(1);
  expect(blocks.getBlockNode(root.id)?.collapsed).toBe(true);
  expect(blocks.getBlockNode(root.id)?.dropPlacement).toBe("siblings");
  remove();
  expect(listener).toHaveBeenCalledTimes(2);
  expect(blocks.getBlockNode(root.id)?.collapsed).toBe(false);
  expect(blocks.getBlockNode(root.id)?.dropPlacement).toBeUndefined();
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
      style: { background: { color: "#ff0000" } },
      custom: 42,
    },
  });
  const blocks = new PageBlocks(panel, panel.editor.blockBehaviors);
  expect(blocks.getBlockNode(node.id)?.style?.background?.color).toBe("#ff0000");
  core.history.stopCapturing();
  blocks.updateBlockNode(node.id, { listType: null, style: null, checked: true });
  expect(panel.blocks.getBlockNode(node.id)?.listProps).toEqual({ checked: true, custom: 42 });
  core.history.undo();
  expect(panel.blocks.getBlockNode(node.id)?.listProps).toEqual(node.listProps);
  core.history.redo();
  expect(panel.blocks.getBlockNode(node.id)?.listProps).toEqual({ checked: true, custom: 42 });
  panel.editor.destroy();
  core.destroy();
});

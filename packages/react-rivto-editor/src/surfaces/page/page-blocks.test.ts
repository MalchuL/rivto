const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;
import { ChildrenPanel } from "@chulane/rivto";
import { ReactPanel } from "../../panels/react-panel";
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { PageBlocks } from "./page-blocks";
import {
  PAGE_BLOCK_DECORATIONS_KEY,
  type PageBlockDecorationAdapter,
} from "../../blocks/page-block-decorations";

it("keeps default decoration adapters independent between editors", async () => {
  const core = await createTestCoreEditor();
  const first = createTestReactEditor({ editor: core });
  const second = createTestReactEditor({ editor: core });
  try {
    const firstAdapter = first.editor.extensions.shared
      .getValue<PageBlockDecorationAdapter>(PAGE_BLOCK_DECORATIONS_KEY)
      ?.get();
    const secondAdapter = second.editor.extensions.shared
      .getValue<PageBlockDecorationAdapter>(PAGE_BLOCK_DECORATIONS_KEY)
      ?.get();
    expect(firstAdapter).toBeDefined();
    expect(secondAdapter).toBeDefined();
    expect(firstAdapter).not.toBe(secondAdapter);
  } finally {
    await first.editor.destroy();
    await second.editor.destroy();
    await core.destroy();
  }
});

it("reuses model snapshots and addressed subscriptions without visiting descendants", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = panel.blocks.insertBlock({ type: "paragraph", children: [{ type: "paragraph" }] });
  const blocks = new PageBlocks(panel, panel.editor.blockBehaviors);
  const recursive = jestApi.spyOn(core.blocks, "getBlock");
  const first = blocks.getBlockNode(root.id)!;
  expect(blocks.getBlockNode(root.id)).toBe(first);
  expect(first.color).toBe("transparent");
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

it("observes shared decoration adapters and uses their current property mapping", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const node = panel.blocks.insertBlock({ type: "paragraph", listProps: { custom: 42 } });
  const blocks = new PageBlocks(panel, panel.editor.blockBehaviors);
  const shared = panel.editor.extensions.shared.getValue<PageBlockDecorationAdapter>(
    PAGE_BLOCK_DECORATIONS_KEY,
  )!;
  const original = shared.get()!;
  const first = blocks.getBlockNode(node.id);
  const listener = jestApi.fn();
  const unsubscribe = blocks.subscribeBlockNode(node.id, listener);
  const custom: PageBlockDecorationAdapter = {
    /**
     * Reads the host's custom color while preserving other built-in decorations.
     *
     * @param block - Current block node.
     * @returns Built-in presentation with the host color.
     */
    read(block) {
      return { ...original.read(block), color: String(block.listProps.hostTint ?? "transparent") };
    },
    /**
     * Writes a Page color under the host's own property key.
     *
     * @param patch - Requested Page decoration changes.
     * @returns Detached host property changes.
     */
    prepare(patch) {
      return { listProps: { hostTint: patch.color }, removals: [] };
    },
  };
  try {
    shared.set(custom);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(blocks.getBlockNode(node.id)).not.toBe(first);
    blocks.updateBlockNode(node.id, { color: "rebeccapurple" });
    expect(panel.blocks.getBlockNode(node.id)?.listProps).toMatchObject({
      custom: 42,
      hostTint: "rebeccapurple",
    });
    expect(blocks.getBlockNode(node.id)?.color).toBe("rebeccapurple");
    shared.set(original);
    expect(blocks.getBlockNode(node.id)?.color).toBe("transparent");
  } finally {
    unsubscribe();
    await panel.editor.destroy();
    await core.destroy();
  }
});

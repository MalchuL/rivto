/** @jest-environment ./jest-browser-environment.mjs */
const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;
import { createStructuralSelection, createCaretSelection } from "@chulane/rivto";
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { BLOCK_TEXT_METADATA_KEY } from "../../managers/selection/block-text-metadata";
import { PageBlocks } from "./page-blocks";
import { PageSelection } from "./page-selection";

it("skips range traversal without observers and keeps the next membership comparison current", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = panel.blocks.insertBlock({ type: "paragraph" });
  let reads = 0;
  let shared = createStructuralSelection([block.id]);
  const range = shared.blocks[0]!;
  shared.blocks[0] = {
    ...range,
    /** Reads coverage only when an addressed observer needs a comparison. */
    get start() {
      reads += 1;
      return range.start;
    },
  };
  const selection = new PageSelection(
    {
      blocks: panel.blocks,
      selection: panel.selection,
      document: { selection: { snapshot: () => shared } },
      editor: panel.editor,
      subscribe: panel.subscribe,
    },
    new PageBlocks(panel, panel.editor.blockBehaviors),
  );
  panel.selection.set(createCaretSelection(block.id, 0));
  expect(reads).toBe(0);
  const changed = jestApi.fn();
  selection.subscribeBlock(block.id, changed);
  shared = createCaretSelection(block.id, 1);
  panel.selection.set(createCaretSelection(block.id, 1));
  expect(changed).toHaveBeenCalledTimes(1);
  expect(reads).toBe(1);
  selection.destroy();
  panel.editor.destroy();
  core.destroy();
});

it("retains panel selection and notifies only changed structural members", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const first = panel.blocks.insertBlock({ type: "paragraph" }).id;
  const second = panel.blocks.insertBlock({ type: "paragraph" }).id;
  const blocks = new PageBlocks(panel, panel.editor.blockBehaviors);
  const selection = new PageSelection(panel, blocks);
  const firstChanged = jestApi.fn();
  const secondChanged = jestApi.fn();
  const oldRelease = selection.subscribeBlock(first, () => {});
  oldRelease();
  selection.subscribeBlock(first, firstChanged);
  oldRelease();
  selection.subscribeBlock(second, secondChanged);
  selection.set(createStructuralSelection([first]));
  expect(selection.get()).toBe(panel.selection.snapshot());
  expect(firstChanged).toHaveBeenCalledTimes(1);
  expect(secondChanged).not.toHaveBeenCalled();
  selection.set(createStructuralSelection([first, second]));
  expect(firstChanged).toHaveBeenCalledTimes(1);
  expect(secondChanged).toHaveBeenCalledTimes(1);
  selection.set(createCaretSelection(second, 0));
  expect(firstChanged).toHaveBeenCalledTimes(2);
  expect(secondChanged).toHaveBeenCalledTimes(2);
  selection.destroy();
  selection.set(createStructuralSelection([first]));
  expect(firstChanged).toHaveBeenCalledTimes(2);
  expect(panel.selection.isBlockSelected(first)).toBe(true);
  panel.editor.destroy();
  core.destroy();
});

it("distinguishes empty declared text from contentless blocks without mounted DOM", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  panel.editor.blockTypes.register({
    definition: { type: "text-fixture", metadata: { [BLOCK_TEXT_METADATA_KEY]: true } },
    render: () => null,
  });
  const text = panel.blocks.insertBlock({ type: "text-fixture" }).id;
  const contentless = panel.blocks.insertBlock({ type: "paragraph" }).id;
  const blocks = new PageBlocks(panel, panel.editor.blockBehaviors);
  const selection = new PageSelection(panel, blocks);
  expect(selection.getTextLength(text)).toBe(0);
  expect(selection.getTextLength(contentless)).toBeUndefined();
  expect(selection.getTextLength("missing")).toBeUndefined();
  panel.blocks.updateBlock(text, { content: "A😀" });
  expect(selection.getTextLength(text)).toBe(3);
  panel.editor.blockTypes.delete("text-fixture");
  expect(selection.getTextLength(text)).toBeUndefined();
  selection.destroy();
  panel.editor.destroy();
  core.destroy();
});

it("retains offscreen IDs and stable order across payload edits and live visibility changes", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const parent = panel.blocks.insertBlock({ type: "paragraph", children: [{ type: "paragraph" }] });
  const blocks = new PageBlocks(panel, panel.editor.blockBehaviors);
  const selection = new PageSelection(panel, blocks);
  const initial = selection.getSelectableBlockIds();
  expect(initial).toEqual([parent.id, parent.children[0]!.id]);
  panel.blocks.updateBlock(parent.children[0]!.id, { content: "Offscreen update" });
  expect(selection.getSelectableBlockIds()).toBe(initial);
  const hide = panel.editor.blockBehaviors.register({
    /**
     * Selects every fixture node for this visibility rule.
     *
     * @returns True for the fixture's nodes.
     */
    isAvailable: () => true,
    /**
     * Hides descendants without removing their model selection.
     *
     * @returns False while this registration exists.
     */
    childrenVisible: () => false,
  });
  selection.set(createStructuralSelection([parent.children[0]!.id]));
  expect(selection.getSelectableBlockIds()).toEqual([parent.id]);
  expect(selection.get()?.blocks[0]?.id).toBe(parent.children[0]!.id);
  hide();
  expect(selection.getSelectableBlockIds()).toEqual(initial);
  selection.destroy();
  panel.editor.destroy();
  core.destroy();
});

it("reserves canvas background and pan gestures while accepting block content", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.innerHTML = '<div data-block-id="one"><span data-block-content></span></div>';
  const selection = new PageSelection(
    {
      mode: panel.mode,
      blocks: panel.blocks,
      selection: panel.selection,
      document: panel.document,
      editor: panel.editor,
      subscribe: panel.subscribe,
      getRoot: () => root,
    },
    new PageBlocks(panel, panel.editor.blockBehaviors),
  );
  const accepted: boolean[] = [];
  root.addEventListener("pointerdown", (event) =>
    accepted.push(selection.canStartSelection(event as MouseEvent)),
  );
  panel.mode.set("edgeless");
  root.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  root.querySelector("span")!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  root.dataset.panningReady = "true";
  root.querySelector("span")!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  panel.mode.set("block");
  root.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  expect(accepted).toEqual([false, true, false, true]);
  selection.destroy();
  panel.editor.destroy();
  core.destroy();
});

it("excludes edgeless root separators but retains nested separators and offscreen content", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const release = panel.editor.blockTypes.register({
    definition: { type: "separator-fixture" },
    separatesBlockElements: true,
    render: () => null,
  });
  const first = panel.blocks.insertBlock({
    type: "paragraph",
    children: [{ type: "separator-fixture" }],
  });
  const separator = panel.blocks.insertBlock({ type: "separator-fixture" });
  const last = panel.blocks.insertBlock({ type: "paragraph" });
  const selection = new PageSelection(panel, new PageBlocks(panel, panel.editor.blockBehaviors));
  try {
    expect(selection.getSelectableBlockIds()).toContain(separator.id);
    panel.mode.set("edgeless");
    expect(selection.getSelectableBlockIds()).toEqual([first.id, first.children[0]!.id, last.id]);
    release();
    expect(selection.getSelectableBlockIds()).toContain(separator.id);
    panel.mode.set("block");
    expect(selection.getSelectableBlockIds()).toContain(separator.id);
  } finally {
    selection.destroy();
    panel.editor.destroy();
    core.destroy();
  }
});

import { edgelessPreset } from "../extensions/edgeless";
import { ReactPanel } from "./react-panel";
import { outdentBlocks } from "../block-behaviors/ops/outline-ops";
import { createTestCoreEditor, createTestReactEditor } from "../test-utils";
import { ChildrenPanel } from "@chulane/rivto";
import { PanelElements } from "@chulane/rivto";

const groupInput = { type: "group", frame: { x: 0, y: 0, width: 100, height: 100 }, zIndex: 0 };

it("reconciles separate element groups of one subtree without resetting their geometry", async () => {
  const core = await createTestCoreEditor();
  const fullPanel = createTestReactEditor({ editor: core });
  const runtime = fullPanel.editor;
  const root = core.blocks.insertBlock({ type: "paragraph", content: "Title", children: [{ type: "paragraph", content: "Child" }] });
  const first = runtime.elements.insertElement(groupInput);
  const second = runtime.elements.insertElement(groupInput);
  const releaseFirst = runtime.blockElements.maintainBlockCards(root.id, first.id); const releaseSecond = runtime.blockElements.maintainBlockCards(root.id, second.id);
  const a = new PanelElements(runtime.elements, runtime.getDocument(), first.id); const b = new PanelElements(runtime.elements, runtime.getDocument(), second.id);
  const card = a.getElementNodes()[0]!;
  expect(card.props.startBlockId).toBe(root.children[0]!.id);
  expect(b.getElementNodes()[0]!.id).not.toBe(card.id);
  const before = b.getElementNodes();
  a.updateElement(card.id, { frame: { x: 555 } });
  expect(b.getElementNodes()).toBe(before);
  expect(() => a.updateElement(before[0]!.id, { frame: { x: 100 } })).toThrow();
  const releaseAgain = runtime.blockElements.maintainBlockCards(root.id, first.id);
  expect(a.getElementNodes()).toHaveLength(1);
  expect(a.getElementNode(card.id)!.frame.x).toBe(555);
  releaseFirst(); releaseAgain(); releaseSecond(); runtime.destroy(); await core.destroy();
});

it("shows children and prevents outdenting them past the Panel root", async () => {
  const core = await createTestCoreEditor(); const fullPanel = createTestReactEditor({ editor: core });
  const root = core.blocks.insertBlock({ type: "paragraph", children: [{ type: "paragraph", content: "Child" }] });
  const reactPanel = new ReactPanel(fullPanel.editor, new ChildrenPanel(fullPanel.editor, { rootBlockId: root.id }), {  });
  expect(reactPanel.blocks.getRootIds()).toEqual([root.children[0]!.id]);
  outdentBlocks(reactPanel, [root.children[0]!.id]);
  expect(core.blocks.getParentId(root.children[0]!.id)).toBe(root.id);
  core.history.clear(); core.blocks.removeBlock(root.id);
  expect(reactPanel.blocks.getRootIds()).toEqual([]);
  core.history.undo();
  expect(reactPanel.blocks.getRootIds()).toEqual([root.children[0]!.id]);
  fullPanel.editor.destroy(); await core.destroy();
});

it("pastes text and structured blocks into an empty Panel without changing document roots", async () => {
  const core = await createTestCoreEditor(); const fullPanel = createTestReactEditor({ editor: core });
  const root = core.blocks.insertBlock({ type: "paragraph", content: "Title" });
  const reactPanel = new ReactPanel(fullPanel.editor, new ChildrenPanel(fullPanel.editor, { rootBlockId: root.id }), {  });
  reactPanel.clipboard.paste({ text: "Pasted child", defaultBlockType: "paragraph" });
  expect(core.blocks.getRootIds()).toEqual([root.id]);
  expect(core.blocks.getBlock(root.id)!.children[0]!.content).toBe("Pasted child");
  core.blocks.removeBlocks([...core.blocks.getBlockNode(root.id)!.childIds]);
  reactPanel.clipboard.paste({ bundle: { version: 4, blocks: [{ id: "source", type: "paragraph", content: "Structured", props: {}, listProps: {}, pluginData: {}, children: [] }] } });
  expect(core.blocks.getRootIds()).toEqual([root.id]);
  expect(core.blocks.getBlock(root.id)!.children[0]!.content).toBe("Structured");
  fullPanel.editor.destroy(); await core.destroy();
});

it("remaps copied group and connector references into the receiving element subtree", async () => {
  const { ElementPasteStrategy } = await import("../extensions/built-ins/clipboard/element-paste-strategy");
  const core = await createTestCoreEditor(); const fullPanel = createTestReactEditor({ editor: core, extensions: [...edgelessPreset()] });
  const container = core.elements.insertElement(groupInput);
  const reactPanel = new ReactPanel(fullPanel.editor, new ChildrenPanel(fullPanel.editor, { rootElementId: container.id }), {  });
  const base = { childIds: [], type: "rectangle", frame: { x: 0, y: 0, width: 40, height: 50 }, zIndex: 0 };
  const left = core.elements.insertElement(base);
  const right = core.elements.insertElement(base);
  const connector = core.elements.insertElement({ ...base, type: "connector", props: { source: { elementId: left.id, anchor: { x: 1, y: .5 }, position: { x: 1, y: 2 } }, target: { elementId: right.id, anchor: { x: 0, y: .5 }, position: { x: 3, y: 4 } } } });
  const group = core.elements.insertElement({ ...base, type: "group", childIds: [left.id, right.id, connector.id], props: {} });
  const result = new ElementPasteStrategy(reactPanel).paste({ bundle: { version: 4, blocks: [], elements: [left, right, connector, group].map(({ id }) => core.elements.getElementNode(id)!), selectedElementIds: [group.id] } }, {});
  const ids = result!.elementIdMap!;
  expect(reactPanel.elements.getElementNodes()).toHaveLength(4);
  expect(reactPanel.elements.getElementNode(ids.get(group.id)!)!.childIds).toEqual([left, right, connector].map((element) => ids.get(element.id)));
  expect(reactPanel.elements.getElementNode(ids.get(connector.id)!)!.props.source).toMatchObject({ elementId: ids.get(left.id) });
  expect(core.elements.getElement(group.id)).toEqual(group);
  fullPanel.editor.destroy(); await core.destroy();
});

it("shares document elements between null-root Panels without deleting another block scope", async () => {
  const core = await createTestCoreEditor(); const fullPanel = createTestReactEditor({ editor: core });
  const runtime = fullPanel.editor;
  const a = core.blocks.insertBlock({ type: "paragraph", children: [{ type: "paragraph", content: "A" }] });
  const b = core.blocks.insertBlock({ type: "paragraph", children: [{ type: "paragraph", content: "B" }] });
  const releaseA = runtime.blockElements.maintainBlockCards(a.id, null);
  const releaseB = runtime.blockElements.maintainBlockCards(b.id, null);
  await Promise.resolve();
  const cards = core.elements.getElementNodes();
  expect(cards.every((element) => element.type === "block")).toBe(true);
  expect(cards.filter((element) => element.props.startBlockId === a.children[0]!.id)).toHaveLength(1);
  expect(cards.filter((element) => element.props.startBlockId === b.children[0]!.id)).toHaveLength(1);
  const cardA = cards.find((element) => element.props.startBlockId === a.children[0]!.id)!;
  core.elements.updateElement(cardA.id, { frame: { x: 456 } });
  const releaseAgain = runtime.blockElements.maintainBlockCards(a.id, null);
  await Promise.resolve();
  expect(core.elements.getElementNodes()).toHaveLength(cards.length);
  expect(core.elements.getElementNode(cardA.id)!.frame.x).toBe(456);
  releaseA(); releaseAgain(); releaseB(); runtime.destroy(); await core.destroy();
});

it("reassigns a moved block card to its current parent while retaining ID and geometry", async () => {
  const core = await createTestCoreEditor(); const fullPanel = createTestReactEditor({ editor: core });
  const runtime = fullPanel.editor;
  const a = core.blocks.insertBlock({ type: "paragraph", children: [{ type: "paragraph", content: "Moving" }] });
  const b = core.blocks.insertBlock({ type: "paragraph" });
  const releaseA = runtime.blockElements.maintainBlockCards(a.id, null);
  const card = core.elements.getElementNodes().find((element) => element.props.startBlockId === a.children[0]!.id)!;
  core.elements.updateElement(card.id, { frame: { x: 345 } });
  core.blocks.moveBlocks([a.children[0]!.id], b.id, "inside");
  const releaseB = runtime.blockElements.maintainBlockCards(b.id, null);
  await Promise.resolve();
  expect(core.elements.getElementNode(card.id)).toMatchObject({ frame: { x: 345 }, props: { startBlockId: a.children[0]!.id, endBlockId: a.children[0]!.id } });
  expect(core.blocks.getBlockNode(a.id)!.childIds).toEqual([]);
  expect(core.elements.getElementNodes().filter((element) => element.props.startBlockId === a.children[0]!.id)).toHaveLength(1);
  releaseA(); releaseB(); runtime.destroy(); await core.destroy();
});

it("keeps an explicit element root empty after deletion and restores it through undo", async () => {
  const core = await createTestCoreEditor(); const fullPanel = createTestReactEditor({ editor: core });
  const root = core.blocks.insertBlock({ type: "paragraph", children: [{ type: "paragraph" }] });
  const container = core.elements.insertElement(groupInput);
  const release = fullPanel.editor.blockElements.maintainBlockCards(root.id, container.id);
  const elements = new PanelElements(core.elements, core.getDocument(), container.id);
  const card = elements.getElementNodes()[0]!;
  await Promise.resolve();
  expect(elements.getElementNodes()).toHaveLength(1);
  core.history.clear(); core.elements.removeElement(container.id);
  await Promise.resolve();
  expect(elements.getElements()).toEqual([]);
  expect(() => elements.insertElement(groupInput)).toThrow("not found");
  core.history.undo(); await Promise.resolve();
  expect(elements.getElementNodes().map(({ id }) => id)).toEqual([card.id]);
  release(); fullPanel.editor.destroy(); await core.destroy();
});

it("adopts a compatible existing card when an explicit element group is opened", async () => {
  const core = await createTestCoreEditor(); const fullPanel = createTestReactEditor({ editor: core });
  const block = core.blocks.insertBlock({ type: "paragraph" });
  const container = core.elements.insertElement({ ...groupInput, children: [{
    type: "block", id: "existing-card", frame: { x: 234, y: 80, width: 300, height: 120 }, zIndex: 7,
    props: { startBlockId: block.id, endBlockId: block.id },
  }] });
  const release = fullPanel.editor.blockElements.maintainBlockCards(null, container.id);
  await Promise.resolve();
  const cards = new PanelElements(core.elements, core.getDocument(), container.id).getElementNodes();
  expect(cards).toHaveLength(1);
  expect(cards[0]).toMatchObject({ id: "existing-card", frame: { x: 234 }, zIndex: 7,
    props: { startBlockId: block.id, endBlockId: block.id } });
  release(); fullPanel.editor.destroy(); await core.destroy();
});

it("repairs and removes only block elements in the Panel's block scope", async () => {
  const core = await createTestCoreEditor(); const fullPanel = createTestReactEditor({ editor: core });
  const root = core.blocks.insertBlock({ type: "paragraph", children: [
    { type: "paragraph", content: "First" }, { type: "paragraph", content: "Last" },
  ] });
  const container = core.elements.insertElement(groupInput);
  const elements = new PanelElements(core.elements, core.getDocument(), container.id);
  const shape = elements.insertElement({ ...groupInput, type: "rectangle" });
  const projection = fullPanel.editor.blockElements.createPanelProjection(root.id, container.id);
  projection.reconcile();
  const card = elements.getElementNodes().find((element) => element.type === "block")!;
  elements.updateElement(card.id, { props: { rotation: 25, autoHeight: false } });
  core.blocks.removeBlock(root.children[0]!.id);
  projection.reconcile();
  expect(elements.getElementNode(card.id)?.props).toEqual({
    startBlockId: root.children[1]!.id, endBlockId: root.children[1]!.id,
    rotation: 25, autoHeight: false,
  });
  core.blocks.removeBlock(root.children[1]!.id);
  projection.reconcile();
  expect(elements.hasElement(card.id)).toBe(false);
  expect(elements.getElement(shape.id)).toEqual(shape);
  expect(core.blocks.hasBlock(root.id)).toBe(true);
  projection.destroy(); fullPanel.editor.destroy(); await core.destroy();
});

it("does not recreate valid block elements in overlapping Panel areas", async () => {
  const core = await createTestCoreEditor(); const fullPanel = createTestReactEditor({ editor: core });
  core.blocks.insertBlock({ type: "paragraph", content: "Shared" });
  const a = core.elements.insertElement(groupInput); const b = core.elements.insertElement(groupInput);
  const first = fullPanel.editor.blockElements.createPanelProjection(null, a.id);
  const second = fullPanel.editor.blockElements.createPanelProjection(null, b.id);
  first.reconcile(); second.reconcile();
  const secondCard = new PanelElements(core.elements, core.getDocument(), b.id).getElementNodes()[0]!;
  core.elements.updateElement(secondCard.id, { frame: { x: 456 }, props: { rotation: 25 } });
  const before = core.elements.getElementNodes();
  // The document area includes both groups. Revisiting any area must be idempotent.
  fullPanel.editor.blockElements.reconcile(); first.reconcile(); second.reconcile();
  expect(core.elements.getElementNodes()).toEqual(before);
  first.destroy(); second.destroy(); fullPanel.editor.destroy(); await core.destroy();
});

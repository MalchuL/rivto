import { createTestCoreEditor } from "../../test-utils";
import { YjsDoc } from "@chulane/crdt-doc";
import { DocumentModelImpl } from "@chulane/document-model";
import { createStructuralSelection } from "@chulane/rivto";
import {
  createSideBlock,
  deleteSideBlock,
  getSideBlock,
  getSideBlocks,
  updateSideBlockData,
} from "./side-blocks-store";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("reads only the requested valid side-block record", async () => {
  const editor = await createTestCoreEditor();
  const document = editor.getDocument();
  const anchor = editor.blocks.insertBlock({ type: "paragraph" });
  const side = createSideBlock(document, {
    anchorId: anchor.id,
    type: "note",
    data: { text: "One" },
  });
  const get = jestApi.spyOn(document.pluginData, "get");
  expect(getSideBlock(document, side.id)).toEqual(side);
  expect(get).toHaveBeenCalledTimes(1);
  expect(getSideBlock(document, "missing")).toBeUndefined();
  document.pluginData.set(`rivto.side-blocks.${side.id}`, { ...side, id: "other" });
  expect(getSideBlock(document, side.id)).toBeUndefined();
  get.mockRestore();
  await editor.destroy();
});

it("persists independently editable side blocks and preserves them when an anchor is deleted", async () => {
  const editor = await createTestCoreEditor();
  const document = editor.getDocument();
  const anchor = editor.blocks.insertBlock({ type: "paragraph", content: "Anchor" });
  const first = createSideBlock(document, {
    anchorId: anchor.id,
    type: "comment",
    data: { text: "One" },
  });
  const second = createSideBlock(document, {
    anchorId: anchor.id,
    type: "note",
    data: { text: "Two" },
    spacing: "flow",
  });
  document.pluginData.set("unrelated", { large: "x".repeat(10_000) });
  const readNamespace = jestApi.spyOn(document.pluginData, "get");
  getSideBlocks(document);
  expect(readNamespace).toHaveBeenCalledTimes(2);
  expect(readNamespace).not.toHaveBeenCalledWith("unrelated");
  readNamespace.mockRestore();
  updateSideBlockData(document, first.id, { text: "Changed" });
  expect(getSideBlocks(document)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: first.id, data: { text: "Changed" } }),
      expect.objectContaining({ id: second.id, data: { text: "Two" }, spacing: "flow" }),
    ]),
  );
  document.history.undo();
  expect(getSideBlocks(document).find((block) => block.id === first.id)?.data).toEqual({
    text: "One",
  });
  document.history.redo();
  expect(getSideBlocks(document).find((block) => block.id === first.id)?.data).toEqual({
    text: "Changed",
  });
  editor.blocks.removeBlock(anchor.id);
  expect(getSideBlocks(document)).toHaveLength(2);
  document.history.undo();
  expect(document.blocks.hasBlock(anchor.id)).toBe(true);
  expect(deleteSideBlock(document, first.id)).toBe(true);
  expect(getSideBlocks(document)).toHaveLength(1);
  await editor.destroy();
});

it("round trips side blocks through snapshots without including them in block clipboard data", async () => {
  const editor = await createTestCoreEditor();
  const document = editor.getDocument();
  const anchor = editor.blocks.insertBlock({ type: "paragraph", content: "Anchor" });
  const side = createSideBlock(document, { anchorId: anchor.id, type: "note", data: "Side" });
  const snapshot = document.getSnapshot();
  expect(snapshot.pluginData?.[`rivto.side-blocks.${side.id}`]).toMatchObject({ id: side.id });
  const copied = editor.clipboard.copy(createStructuralSelection([anchor.id]));
  expect(copied?.blocks[0]?.content).toBe("Anchor");
  expect(JSON.stringify(copied)).not.toContain(side.id);
  const restored = new DocumentModelImpl(new YjsDoc("side-snapshot"));
  restored.loadSnapshot(snapshot);
  expect(getSideBlocks(restored)).toEqual(getSideBlocks(document));
  await editor.destroy();
  await restored.destroy();
});

it("merges independently created side blocks when peers start without side data", async () => {
  const leftCrdt = new YjsDoc("side-left");
  const rightCrdt = new YjsDoc("side-right");
  const left = new DocumentModelImpl(leftCrdt);
  const right = new DocumentModelImpl(rightCrdt);
  const editor = await createTestCoreEditor({ document: left });
  const anchor = editor.blocks.insertBlock({ type: "paragraph", content: "Shared" });
  rightCrdt.applySnapshot(leftCrdt.getSnapshot());
  const first = createSideBlock(left, { anchorId: anchor.id, type: "note", data: "Left" });
  const second = createSideBlock(right, { anchorId: anchor.id, type: "note", data: "Right" });
  const leftSnapshot = leftCrdt.getSnapshot();
  const rightSnapshot = rightCrdt.getSnapshot();
  leftCrdt.applySnapshot(rightSnapshot);
  rightCrdt.applySnapshot(leftSnapshot);
  expect(
    getSideBlocks(left)
      .map((block) => block.id)
      .sort(),
  ).toEqual([first.id, second.id].sort());
  expect(getSideBlocks(right)).toEqual(getSideBlocks(left));
  await editor.destroy();
  await right.destroy();
});

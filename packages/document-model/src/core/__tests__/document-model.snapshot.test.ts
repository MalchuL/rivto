/**
 * Verifies snapshot validation and stable identity at document storage boundaries.
 * Rejected imports and placements must leave the persisted document unchanged.
 * Editor-specific merge behavior is covered by the public block manager tests.
 */
import { YjsDoc } from "@chulane/crdt-doc";
import { DocumentModelImpl } from "../document-model";
import type { Block } from "../types";

const paragraph = (
  id: string,
  content = "",
  children: Block[] = [],
): Block => ({
  id,
  type: "paragraph",
  listProps: {},
  props: {},
  pluginData: {},
  content,
  children,
});

describe("DocumentModelImpl snapshot and insert preflight", () => {
  it("throws when insertBlock is asked to follow a missing sibling", () => {
    const doc = new YjsDoc("missing-after");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({ id: "a", type: "paragraph" });

    expect(() => model.blocks.insertBlock({ id: "b", type: "paragraph" }, "missing"))
      .toThrow("Target block missing not found");
    expect(model.blocks.getRootIds()).toEqual(["a"]);
    void doc.destroy();
  });

  it("rejects a cyclic or duplicate descendant before replacing blocks", () => {
    const doc = new YjsDoc("cyclic-forest");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({ id: "kept", type: "paragraph", content: "Safe" });
    const cyclic = paragraph("root", "Root");
    cyclic.children.push(cyclic);

    expect(() => model.loadSnapshot({ version: 6, blocks: [cyclic] }))
      .toThrow("Block forest must be acyclic");
    expect(model.blocks.getBlock("kept")?.content).toBe("Safe");

    expect(() => model.loadSnapshot({
      version: 6,
      blocks: [paragraph("dup"), paragraph("dup")],
    })).toThrow("Duplicate block dup");
    expect(model.blocks.getBlock("kept")).toBeDefined();
    void doc.destroy();
  });

  it("rejects empty block and element IDs at create boundaries", () => {
    const doc = new YjsDoc("empty-ids");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({ id: "ok", type: "paragraph" });

    expect(() => model.blocks.insertBlock({ id: "", type: "paragraph" }))
      .toThrow("Block ID is required");
    expect(() => model.blocks.insertBlock({ id: "   ", type: "paragraph" }))
      .toThrow("Block ID is required");
    expect(() => model.elements.insertElement({
      id: "  ",
      type: "note",
      frame: { x: 0, y: 0, width: 10, height: 10 },
      zIndex: 0,
    })).toThrow("Element ID is required");
    expect(model.blocks.getRootIds()).toEqual(["ok"]);
    void doc.destroy();
  });

  it("keeps automatic ID generation private to document managers", () => {
    const doc = new YjsDoc("private-ids");
    const model = new DocumentModelImpl(doc);

    const rootId = model.blocks.insertBlock({ type: "paragraph", content: "Root" });
    const parentId = model.blocks.insertBlock({
      type: "paragraph",
      children: [{ type: "paragraph", content: "Nested" }],
    });
    const childId = model.blocks.getBlock(parentId)?.children[0]?.id;
    const elementId = model.elements.insertElement({
      type: "note",
      frame: { x: 0, y: 0, width: 10, height: 10 },
      zIndex: 0,
    });

    expect(childId).toBeDefined();
    expect(new Set([rootId, parentId, childId, elementId]).size).toBe(4);
    expect(model.blocks.insertBlock({ id: "explicit", type: "paragraph" })).toBe("explicit");
    void doc.destroy();
  });

  it("creates import ID maps inside the document", () => {
    const doc = new YjsDoc("import-ids");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({ id: "occupied-block", type: "paragraph" });
    model.elements.insertElement({
      id: "occupied-element",
      type: "note",
      frame: { x: 0, y: 0, width: 10, height: 10 },
      zIndex: 0,
    });

    const blockIds = model.blocks.createImportIdMap(["free-block", "occupied-block"]);
    const elementIds = model.elements.createImportIdMap(["free-element", "occupied-element"]);

    expect(blockIds.get("free-block")).toBe("free-block");
    expect(blockIds.get("occupied-block")).not.toBe("occupied-block");
    expect(elementIds.get("free-element")).toBe("free-element");
    expect(elementIds.get("occupied-element")).not.toBe("occupied-element");
    void doc.destroy();
  });

  it("requires a placed target for move inside", () => {
    const doc = new YjsDoc("placed-target");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({ id: "visible", type: "paragraph" });

    expect(() => model.blocks.moveBlock("visible", "ghost", "inside"))
      .toThrow("Target block ghost not found");
    expect(model.blocks.getRootIds()).toEqual(["visible"]);
    void doc.destroy();
  });
});

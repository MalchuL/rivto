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

  it("assigns omitted IDs from each manager's generateId independently", () => {
    const doc = new YjsDoc("custom-ids");
    let blocks = 0;
    let elements = 0;
    const model = new DocumentModelImpl(doc);
    model.blocks.generateId = () => `block-${++blocks}`;
    model.elements.generateId = () => `element-${++elements}`;

    expect(model.blocks.insertBlock({ type: "paragraph", content: "Root" })).toBe("block-1");
    expect(model.blocks.insertBlock({
      type: "paragraph",
      children: [{ type: "paragraph", content: "Nested" }],
    })).toBe("block-2");
    expect(model.blocks.getBlock("block-2")?.children[0]?.id).toBe("block-3");
    expect(model.elements.insertElement({
      type: "note",
      frame: { x: 0, y: 0, width: 10, height: 10 },
      zIndex: 0,
    })).toBe("element-1");
    expect(model.blocks.insertBlock({ id: "explicit", type: "paragraph" })).toBe("explicit");
    expect(blocks).toBe(3);
    expect(elements).toBe(1);
    void doc.destroy();
  });

  it("rejects empty identities produced by a manager generateId", () => {
    const doc = new YjsDoc("empty-generated-ids");
    const model = new DocumentModelImpl(doc);
    model.blocks.generateId = () => "  ";
    model.elements.generateId = () => "  ";

    expect(() => model.blocks.insertBlock({ type: "paragraph" }))
      .toThrow("Block ID is required");
    expect(() => model.elements.insertElement({
      type: "note",
      frame: { x: 0, y: 0, width: 10, height: 10 },
      zIndex: 0,
    })).toThrow("Element ID is required");
    expect(model.blocks.getRootIds()).toEqual([]);
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

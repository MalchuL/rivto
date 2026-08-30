import { YjsDoc } from "../../../crdt-doc";
import { DocumentModelImpl } from "../document-model";
import type { Block, Link } from "../types";

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
  it("does not mutate existing state when a late link is invalid", () => {
    const doc = new YjsDoc("late-link");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({ id: "kept", type: "paragraph", content: "Safe" });
    model.links.createLink({
      id: "kept-link",
      from: { blockId: "kept" },
      to: { blockId: "kept" },
    });
    const before = model.getSnapshot();

    expect(() => model.loadSnapshot({
      version: 6,
      blocks: [paragraph("next", "New")],
      links: [{
        id: "broken",
        from: { blockId: "missing" },
        to: { blockId: "next" },
      }],
    })).toThrow("Link endpoints must reference existing blocks");
    expect(model.getSnapshot()).toEqual(before);
    void doc.destroy();
  });

  it("removes retained links whose endpoints disappear in a blocks-only update", () => {
    const doc = new YjsDoc("dangling-links");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({ id: "from", type: "paragraph" });
    model.blocks.insertBlock({ id: "to", type: "paragraph" });
    model.links.createLink({
      id: "edge",
      from: { blockId: "from" },
      to: { blockId: "to" },
    });

    model.loadSnapshot({ version: 6, blocks: [] });

    expect(model.blocks.getBlocks()).toEqual([]);
    expect(model.links.getLinks()).toEqual([]);
    void doc.destroy();
  });

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

  it("rejects empty block, link, and element IDs at create boundaries", () => {
    const doc = new YjsDoc("empty-ids");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({ id: "ok", type: "paragraph" });

    expect(() => model.blocks.insertBlock({ id: "", type: "paragraph" }))
      .toThrow("Block ID is required");
    expect(() => model.blocks.insertBlock({ id: "   ", type: "paragraph" }))
      .toThrow("Block ID is required");
    expect(() => model.links.createLink({
      id: "",
      from: { blockId: "ok" },
      to: { blockId: "ok" },
    })).toThrow("Link ID is required");
    expect(() => model.elements.insertElement({
      id: "  ",
      type: "note",
      frame: { x: 0, y: 0, width: 10, height: 10 },
      zIndex: 0,
    })).toThrow("Element ID is required");
    expect(model.blocks.getRootIds()).toEqual(["ok"]);
    void doc.destroy();
  });

  it("rejects a duplicate link ID instead of overwriting", () => {
    const doc = new YjsDoc("duplicate-link");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({ id: "a", type: "paragraph" });
    model.blocks.insertBlock({ id: "b", type: "paragraph" });
    const first: Link = { id: "edge", from: { blockId: "a" }, to: { blockId: "b" } };
    model.links.createLink(first);

    expect(() => model.links.createLink({
      id: "edge",
      from: { blockId: "b" },
      to: { blockId: "a" },
    })).toThrow("Link edge already exists");
    expect(model.links.getLink("edge")).toEqual({
      ...first,
      meta: {},
    });
    void doc.destroy();
  });

  it("requires a placed target for move inside and merge", () => {
    const doc = new YjsDoc("placed-target");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({ id: "visible", type: "paragraph" });

    expect(() => model.blocks.moveBlock("visible", "ghost", "inside"))
      .toThrow("Target block ghost not found");
    expect(() => model.blocks.mergeBlocks("ghost", "visible"))
      .toThrow("Block ghost not found");
    expect(model.blocks.getRootIds()).toEqual(["visible"]);
    void doc.destroy();
  });
});

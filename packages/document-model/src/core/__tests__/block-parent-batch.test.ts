import { YjsDoc } from "@chulane/crdt-doc";
import * as Y from "yjs";
import { DocumentModelImpl } from "../document-model";

it.each([10, 200])(
  "reads %i live parents once after transaction placement changes",
  async (count) => {
    const doc = new YjsDoc("batch-parent-live");
    const model = new DocumentModelImpl(doc);
    try {
      for (let index = 0; index < count; index += 1) {
        model.blocks.insertBlock({ id: `root-${index}`, type: "paragraph" });
      }
      const roots = doc.doc.getArray<string>("rivto.editor.roots");
      const read = jest.spyOn(roots, "get");
      const snapshot = jest.spyOn(roots, "toArray");
      doc.transact(() => {
        roots.delete(0, 1);
        roots.push(["root-0"]);
        read.mockClear();
        snapshot.mockClear();
        const ids = Array.from({ length: count }, (_, index) => `root-${index}`);
        const result = model.blocks.getParentIds([...ids, "missing", "root-0"]);
        expect([...result]).toEqual(ids.map((id) => [id, null]));
        expect(read).toHaveBeenCalledTimes(0);
        expect(snapshot).toHaveBeenCalledTimes(1);
        expect(model.blocks.getParentId("root-0")).toBeNull();
        expect(model.blocks.getParentId(`root-${count - 1}`)).toBeNull();
        const parent = doc.doc.getMap("rivto.editor.blocks").get("root-1");
        if (!(parent instanceof Y.Map)) {
          throw new Error("Expected a shared block map");
        }
        const children = parent.get("children");
        if (!(children instanceof Y.Array)) {
          throw new Error("Expected a shared child array");
        }
        roots.delete(count - 1, 1);
        children.push(["root-0"]);
        expect(model.blocks.getParentIds(ids).get("root-0")).toBe("root-1");
        expect(model.blocks.getParentId("root-0")).toBe("root-1");
      });
      read.mockRestore();
      snapshot.mockRestore();
    } finally {
      await doc.destroy();
    }
  },
);

it("preserves individual lookup behavior when duplicate placements exist", async () => {
  const doc = new YjsDoc("batch-parent-duplicates");
  const model = new DocumentModelImpl(doc);
  try {
    model.blocks.insertBlock({
      id: "parent",
      type: "paragraph",
      children: [{ id: "child", type: "paragraph" }],
    });
    expect(model.blocks.getParentId("child")).toBe("parent");
    const roots = doc.doc.getArray<string>("rivto.editor.roots");
    doc.transact(() => {
      roots.push(["child"]);
      const ids = [
        "child",
        "parent",
        ...Array.from({ length: 10 }, (_, index) => `missing-${index}`),
      ];
      expect(model.blocks.getParentIds(ids).get("child")).toBe(model.blocks.getParentId("child"));
      roots.delete(0, 1);
      roots.push(["parent"]);
      expect(model.blocks.getParentIds(ids).get("child")).toBe(model.blocks.getParentId("child"));
    });
  } finally {
    await doc.destroy();
  }
});

it("does not inspect an unrelated malformed branch when individual lookups would stop earlier", async () => {
  const doc = new YjsDoc("batch-parent-malformed");
  const model = new DocumentModelImpl(doc);
  try {
    const ids = Array.from({ length: 10 }, (_, index) => `root-${index}`);
    ids.forEach((id) => model.blocks.insertBlock({ id, type: "paragraph" }));
    model.blocks.insertBlock({ id: "malformed", type: "paragraph" });
    const blocks = doc.doc.getMap("rivto.editor.blocks");
    doc.transact(() => {
      const malformed = blocks.get("malformed");
      if (!(malformed instanceof Y.Map)) {
        throw new Error("Expected a shared block map");
      }
      malformed.set("children", "invalid");
      expect([...model.blocks.getParentIds(ids)]).toEqual(ids.map((id) => [id, null]));
      malformed.set("children", new Y.Array());
    });
  } finally {
    await doc.destroy();
  }
});

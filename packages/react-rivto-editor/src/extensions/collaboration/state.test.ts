import { YjsDoc } from "@chulane/crdt-doc";
import { DocumentModelImpl } from "@chulane/document-model";
import { encodeSelection, decodeSelection, presenceSchema } from "./state";

describe("collaboration selection anchors", () => {
  it("tracks concurrent text edits without expanding a range at either boundary", async () => {
    const source = new YjsDoc("shared");
    const replica = new YjsDoc("shared");
    const left = new DocumentModelImpl(source);
    const right = new DocumentModelImpl(replica);
    try {
      left.blocks.insertBlock({ id: "text", type: "paragraph", content: "abcdef" });
      replica.applySnapshot(source.getSnapshot());
      const selection = encodeSelection(left, {
        type: "selection",
        blocks: [{ id: "text", start: 2, end: 4 }],
        anchorBlockId: "text",
        focusBlockId: "text",
      })!;
      right.blocks.insertText("text", 4, "R");
      right.blocks.insertText("text", 2, "L");
      expect(decodeSelection(right, selection).blocks).toEqual([{ id: "text", start: 3, end: 5 }]);
      source.applySnapshot(replica.getSnapshot());
      expect(decodeSelection(left, selection)).toEqual(decodeSelection(right, selection));
      right.blocks.removeBlock("text");
      expect(decodeSelection(right, selection).blocks).toEqual([]);
    } finally {
      await left.destroy();
      await right.destroy();
    }
  });

  it("preserves carets, whole blocks and excludes plugin selection data", async () => {
    const doc = new DocumentModelImpl(new YjsDoc("test"));
    try {
      doc.blocks.insertBlock({ id: "a", type: "paragraph", content: "abc" });
      const caret = encodeSelection(doc, {
        type: "selection",
        blocks: [{ id: "a", start: 1, end: 1 }],
        pluginData: { private: "not presence" },
      })!;
      doc.blocks.insertText("a", 1, "X");
      expect(decodeSelection(doc, caret).blocks).toEqual([{ id: "a", start: 2, end: 2 }]);
      expect(caret).not.toHaveProperty("pluginData");
      const whole = encodeSelection(doc, {
        type: "selection",
        blocks: [{ id: "a", start: 0, end: -1 }],
      })!;
      expect(decodeSelection(doc, whole).blocks).toEqual([{ id: "a", start: 0, end: -1 }]);
      expect(doc.blocks.resolveTextPosition("a", "invalid")).toBeUndefined();
      const before = doc.getSnapshot();
      doc.collaboration.setLocalState({ cursor: caret });
      expect(doc.getSnapshot()).toEqual(before);
    } finally {
      await doc.destroy();
    }
  });

  it("rejects untrusted geometry and CSS colors", () => {
    const state = {
      user: { id: "a", name: "Alex", color: "#123abc" },
      mode: "edgeless",
      pointer: { type: "canvas", x: 1, y: 2 },
      selection: null,
    };
    expect(presenceSchema.safeParse(state).success).toBe(true);
    expect(
      presenceSchema.safeParse({ ...state, pointer: { ...state.pointer, x: Infinity } }).success,
    ).toBe(false);
    expect(
      presenceSchema.safeParse({
        ...state,
        user: { ...state.user, color: "red; background:url(x)" },
      }).success,
    ).toBe(false);
  });
});

test("content patches preserve unchanged text anchors across peers", async () => {
  const source = new YjsDoc("text-patches");
  const replica = new YjsDoc("text-patches");
  const left = new DocumentModelImpl(source);
  const right = new DocumentModelImpl(replica);
  try {
    left.blocks.insertBlock({ id: "text", type: "paragraph", content: "abcdef" });
    replica.applySnapshot(source.getSnapshot());
    const anchor = right.blocks.createTextPosition("text", 4);
    left.blocks.updateBlock("text", { content: "abXcdef" });
    replica.applySnapshot(source.getSnapshot());
    expect(right.blocks.resolveTextPosition("text", anchor)).toBe(5);
    left.blocks.updateBlock("text", { content: "abXcdYZef" });
    replica.applySnapshot(source.getSnapshot());
    expect(right.blocks.resolveTextPosition("text", anchor)).toBe(7);
  } finally {
    await left.destroy();
    await right.destroy();
  }
});

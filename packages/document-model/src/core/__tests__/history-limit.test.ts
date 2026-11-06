import { YjsDoc, YjsDocumentRegistry } from "@chulane/crdt-doc";
import { DEFAULT_MAX_HISTORY_ENTRIES, DocumentModelImpl } from "../document-model";
import { DocumentStorage } from "../document-storage";

test.each([0, 2, DEFAULT_MAX_HISTORY_ENTRIES])(
  "limits document history to %i steps",
  async (limit) => {
    const model = new DocumentModelImpl(new YjsDoc(`limit-${limit}`), {
      maxHistoryEntries: limit,
    });
    model.history.batchUpdatesWithoutHistory(() => {
      model.blocks.insertBlock({ id: "block", type: "paragraph", content: "0" });
    });
    for (let value = 1; value <= limit + 1; value++) {
      model.history.batchUpdates(() =>
        model.blocks.updateBlock("block", { content: String(value) }),
      );
    }
    for (let index = 0; index < limit + 1; index++) {
      model.history.undo();
    }
    expect(model.blocks.getBlock("block")?.content).toBe("1");
    for (let index = 0; index < limit + 1; index++) {
      model.history.redo();
    }
    expect(model.blocks.getBlock("block")?.content).toBe(String(limit + 1));
    await model.destroy();
  },
);

test.each([-1, 1.5, Infinity, NaN])("rejects an invalid history limit: %s", async (limit) => {
  const crdt = new YjsDoc("invalid-history-limit");
  expect(() => new DocumentModelImpl(crdt, { maxHistoryEntries: limit })).toThrow(RangeError);
  await crdt.destroy();
});

test("uses the default limit when no options are supplied", async () => {
  const model = new DocumentModelImpl(new YjsDoc("default-history-limit"));
  model.history.batchUpdatesWithoutHistory(() => {
    model.blocks.insertBlock({ id: "block", type: "paragraph", content: "0" });
  });
  for (let value = 1; value <= DEFAULT_MAX_HISTORY_ENTRIES + 1; value++) {
    model.history.batchUpdates(() => model.blocks.updateBlock("block", { content: String(value) }));
  }
  for (let index = 0; index <= DEFAULT_MAX_HISTORY_ENTRIES; index++) {
    model.history.undo();
  }
  expect(model.blocks.getBlock("block")?.content).toBe("1");
  await model.destroy();
});

test("applies a host-configured limit to documents opened through storage", async () => {
  const storage = new DocumentStorage({
    registry: new YjsDocumentRegistry("history-limit-storage"),
    createDocumentModel: (crdt) => new DocumentModelImpl(crdt, { maxHistoryEntries: 1 }),
  });
  const model = await storage.create("document", [
    { id: "block", type: "paragraph", content: "0" },
  ]);
  for (const value of ["1", "2"]) {
    model.history.batchUpdates(() => model.blocks.updateBlock("block", { content: value }));
  }
  model.history.undo();
  model.history.undo();
  expect(model.blocks.getBlock("block")?.content).toBe("1");
  await model.destroy();
  await storage.destroy();
});

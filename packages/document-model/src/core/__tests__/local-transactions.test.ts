import { YjsDoc } from "@chulane/crdt-doc";
import { DocumentModelImpl } from "../document-model";
import { DocumentBlockManager, DocumentElementManager } from "../managers";

for (const count of [10, 2000]) {
  test(`auto-height writes skip whole-document repair with ${count} blocks and stay outside undo`, async () => {
    const crdt = new YjsDoc("local-height");
    const model = new DocumentModelImpl(crdt);
    model.blocks.insertBlock({
      id: "root",
      type: "paragraph",
      children: Array.from({ length: count }, (_, index) => ({
        id: `child-${index}`,
        type: "paragraph",
      })),
    });
    model.elements.insertElement({
      id: "card",
      type: "block",
      frame: { x: 0, y: 0, width: 720, height: 120 },
      zIndex: 0,
    });
    model.history.clear();
    const block = model.blocks.getBlock("root");
    const repairBlocks = jest.spyOn(DocumentBlockManager.prototype, "normalize");
    const repairElements = jest.spyOn(DocumentElementManager.prototype, "normalize");
    try {
      model.history.batchUpdatesWithoutHistory(() => {
        model.elements.updateElement("card", { frame: { height: 240 } });
      });
      expect(model.elements.getElementNode("card")!.frame.height).toBe(240);
      expect(repairBlocks).not.toHaveBeenCalled();
      expect(repairElements).not.toHaveBeenCalled();
      expect(model.blocks.getBlock("root")).toBe(block);
      model.history.undo();
      expect(model.elements.getElementNode("card")!.frame.height).toBe(240);
      // Provider/native updates still need repair, including a duplicate hierarchy reference.
      crdt.doc.transact(() => {
        crdt.doc.getArray<string>("rivto.editor.roots").push(["root"]);
      }, "remote-merge");
      expect(repairBlocks).toHaveBeenCalledTimes(1);
      expect(repairElements).toHaveBeenCalledTimes(1);
      expect(model.blocks.getRootIds()).toEqual(["root"]);
    } finally {
      repairBlocks.mockRestore();
      repairElements.mockRestore();
      await model.destroy();
    }
  });
}

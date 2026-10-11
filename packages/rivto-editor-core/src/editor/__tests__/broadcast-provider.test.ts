import { BroadcastChannelProvider, YjsDoc } from "@chulane/crdt-doc";
import { DocumentModelImpl } from "@chulane/document-model";
import { createTestEditor as createRivtoEditor } from "../test-utils";

async function eventually(assertion: () => void, timeoutMs = 500): Promise<void> {
  const started = Date.now();
  for (;;) {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() - started > timeoutMs) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

describe("BroadcastChannelProvider editor sync", () => {
  it("syncs seeded Rivto editor blocks to a late-joining peer", async () => {
    const roomId = `room-${crypto.randomUUID()}`;
    const leftDoc = new YjsDoc(`${roomId}:left`);
    const rightDoc = new YjsDoc(`${roomId}:right`);
    const leftFixture = await createRivtoEditor({ document: new DocumentModelImpl(leftDoc) });
    const left = leftFixture;
    const rightFixture = await createRivtoEditor({ document: new DocumentModelImpl(rightDoc) });
    const right = rightFixture;
    const leftProvider = new BroadcastChannelProvider(roomId);
    const rightProvider = new BroadcastChannelProvider(roomId);

    left.blocks.insertBlock({ type: "paragraph", content: "from-left" });
    left.history.clear();

    try {
      await leftDoc.attachProvider(leftProvider);
      await new Promise((resolve) => setTimeout(resolve, 20));
      await rightDoc.attachProvider(rightProvider);

      await eventually(() => {
        expect(right.blocks.getBlocks().map((block) => block.content)).toEqual(["from-left"]);
      });

      left.blocks.insertBlock({ type: "paragraph", content: "second" });
      await eventually(() => {
        expect(right.blocks.getBlocks().map((block) => block.content)).toEqual([
          "from-left",
          "second",
        ]);
      });

      right.blocks.updateBlock(right.blocks.getRootIds()[0]!, { content: "edited-on-right" });
      await eventually(() => {
        expect(left.blocks.getBlocks()[0]?.content).toBe("edited-on-right");
      });
    } finally {
      await leftDoc.detachProvider().catch(() => undefined);
      await rightDoc.detachProvider().catch(() => undefined);
      leftFixture.destroy(); void leftDoc.destroy();
      rightFixture.destroy(); void rightDoc.destroy();
    }
  });
});

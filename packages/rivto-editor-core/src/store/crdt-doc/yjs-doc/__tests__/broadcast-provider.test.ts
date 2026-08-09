import { createRivtoEditor } from "../../../../editor";
import { BroadcastChannelProvider } from "../providers/broadcast";
import { YjsDoc } from "../yjs-doc";

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

describe("BroadcastChannelProvider", () => {
  it("converges two local documents that share a room", async () => {
    const roomId = `room-${crypto.randomUUID()}`;
    const left = new YjsDoc("left");
    const right = new YjsDoc("right");
    const leftProvider = new BroadcastChannelProvider(roomId);
    const rightProvider = new BroadcastChannelProvider(roomId);

    try {
      await left.attachProvider(leftProvider);
      await right.attachProvider(rightProvider);

      left.getText("note").insert(0, "hello sync");
      await eventually(() => {
        expect(right.getText("note").toString()).toBe("hello sync");
      });

      right.getText("note").insert(right.getText("note").length, "!");
      await eventually(() => {
        expect(left.getText("note").toString()).toBe("hello sync!");
      });
    } finally {
      await left.detachProvider().catch(() => undefined);
      await right.detachProvider().catch(() => undefined);
      left.destroy();
      right.destroy();
    }
  });

  it("delivers pre-seeded state to a peer that connects later", async () => {
    const roomId = `room-${crypto.randomUUID()}`;
    const left = new YjsDoc("left");
    const right = new YjsDoc("right");
    left.getText("note").insert(0, "preseeded");

    const leftProvider = new BroadcastChannelProvider(roomId);
    const rightProvider = new BroadcastChannelProvider(roomId);

    try {
      await left.attachProvider(leftProvider);
      // Ensure the join request is not racing the first peer's listener setup.
      await new Promise((resolve) => setTimeout(resolve, 20));
      await right.attachProvider(rightProvider);

      await eventually(() => {
        expect(right.getText("note").toString()).toBe("preseeded");
      });
    } finally {
      await left.detachProvider().catch(() => undefined);
      await right.detachProvider().catch(() => undefined);
      left.destroy();
      right.destroy();
    }
  });

  it("syncs seeded Rivto editor blocks to a late-joining peer", async () => {
    const roomId = `room-${crypto.randomUUID()}`;
    const leftDoc = new YjsDoc(`${roomId}:left`);
    const rightDoc = new YjsDoc(`${roomId}:right`);
    const left = createRivtoEditor({ document: leftDoc });
    const right = createRivtoEditor({ document: rightDoc });
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
      left.destroy();
      right.destroy();
    }
  });
});

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
});

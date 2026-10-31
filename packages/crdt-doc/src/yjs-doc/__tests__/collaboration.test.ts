import { YjsDoc } from "../yjs-doc";
import { BroadcastChannelProvider } from "../providers/broadcast";
import { WebRTCProvider } from "../providers/webrtc";
import { applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";

// Model y-webrtc's asynchronous room teardown without opening native RTC resources.
jest.mock("y-webrtc", () => ({
  WebrtcProvider: class {
    readonly key = Promise.resolve();
    /**
     * Retains the shared awareness channel for lifecycle tests.
     *
     * @param _room - Unused test room identity.
     * @param _doc - Unused native document.
     * @param options - Shared awareness cleared during provider teardown.
     */
    constructor(
      _room: string,
      _doc: unknown,
      private readonly options: {
        awareness: {
          /**
           * Clears transient state during simulated teardown.
           *
           * @param state - Null departure state.
           * @returns Withdraws local presence.
           */
          setLocalState(state: null): void;
        };
      },
    ) {}
    /**
     * Models the provider's synchronous local departure.
     *
     * @returns Clears shared local awareness.
     */
    disconnect(): void {
      this.options.awareness.setLocalState(null);
    }
    /**
     * Models asynchronous room destruction after key initialization.
     *
     * @returns Schedules the second local-awareness removal performed by y-webrtc.
     */
    destroy(): void {
      void this.key.then(() => this.options.awareness.setLocalState(null));
    }
  },
}));

/**
 * Waits for asynchronous BroadcastChannel delivery without assuming message timing.
 *
 * @param assertion - Assertion retried until it passes.
 * @returns Resolves after successful delivery.
 * @throws The last assertion failure after one second.
 */
async function eventually(assertion: () => void): Promise<void> {
  const deadline = Date.now() + 1000;
  for (;;) {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() > deadline) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

describe("transient collaboration", () => {
  it("keeps presence out of snapshots, document notifications, and undo history", async () => {
    const doc = new YjsDoc("test");
    const text = doc.getText("text");
    const history = doc.createUndoManager([text]);
    const before = doc.getSnapshot();
    const updates = jest.fn();
    const presence = jest.fn();
    doc.on("update", updates);
    const unsubscribe = doc.collaboration.subscribe(presence);
    try {
      doc.collaboration.setLocalState({ user: { name: "Alex" } });
      expect(doc.getSnapshot()).toEqual(before);
      expect(doc.toJSON()).toEqual({ text: "" });
      expect(updates).not.toHaveBeenCalled();
      expect(presence).toHaveBeenCalledTimes(1);
      const detached = doc.collaboration.getStates().get(doc.collaboration.clientId)!;
      (detached.user as { name: string }).name = "changed";
      expect(doc.collaboration.getStates().get(doc.collaboration.clientId)).toEqual({
        user: { name: "Alex" },
      });
      history.undo();
      expect(doc.collaboration.getStates().size).toBe(1);
      unsubscribe();
      doc.collaboration.setLocalState(null);
      expect(presence).toHaveBeenCalledTimes(1);
    } finally {
      history.destroy();
      await doc.destroy();
    }
  });

  it("exchanges late-join presence, immediate departure, and reconnect state", async () => {
    const left = new YjsDoc("shared");
    const right = new YjsDoc("shared");
    const room = crypto.randomUUID();
    try {
      left.collaboration.setLocalState({ user: "left" });
      await left.attachProvider(new BroadcastChannelProvider(room));
      await right.attachProvider(new BroadcastChannelProvider(room));
      right.collaboration.setLocalState({ user: "right" });
      await eventually(() => {
        expect(right.collaboration.getStates().get(left.doc.clientID)).toEqual({ user: "left" });
        expect(left.collaboration.getStates().get(right.doc.clientID)).toEqual({ user: "right" });
      });
      await left.detachProvider();
      await eventually(() =>
        expect(right.collaboration.getStates().has(left.doc.clientID)).toBe(false),
      );
      expect(left.collaboration.getStates().has(right.doc.clientID)).toBe(false);
      await left.attachProvider(new BroadcastChannelProvider(room));
      await eventually(() =>
        expect(right.collaboration.getStates().get(left.doc.clientID)).toEqual({ user: "left" }),
      );
    } finally {
      await left.destroy();
      await right.destroy();
    }
  });

  it("does not withdraw presence from another attached provider", async () => {
    const local = new YjsDoc("shared");
    const remote = new YjsDoc("shared");
    const room = crypto.randomUUID();
    try {
      await local.attachProvider(new BroadcastChannelProvider(room));
      await remote.attachProvider(new BroadcastChannelProvider(room));
      const webRtc = new WebRTCProvider(crypto.randomUUID(), { signaling: [] });
      await local.attachProvider(webRtc);
      local.collaboration.setLocalState({ user: "Alex" });
      await eventually(() =>
        expect(remote.collaboration.getStates().has(local.doc.clientID)).toBe(true),
      );
      await local.detachProvider(webRtc.id);
      expect(local.collaboration.awareness.getLocalState()).toEqual({ user: "Alex" });
      await eventually(() =>
        expect(remote.collaboration.getStates().get(local.doc.clientID)).toEqual({ user: "Alex" }),
      );
    } finally {
      await local.destroy();
      await remote.destroy();
    }
  });

  it("expires a silent peer using the awareness protocol heartbeat timeout", async () => {
    jest.useFakeTimers();
    const local = new YjsDoc("shared");
    const remote = new YjsDoc("shared");
    try {
      remote.collaboration.setLocalState({ user: "remote" });
      applyAwarenessUpdate(
        local.collaboration.awareness,
        encodeAwarenessUpdate(remote.collaboration.awareness, [remote.doc.clientID]),
        "test",
      );
      expect(local.collaboration.getStates().has(remote.doc.clientID)).toBe(true);
      local.collaboration.awareness.meta.get(remote.doc.clientID)!.lastUpdated -= 33000;
      jest.advanceTimersByTime(3000);
      expect(local.collaboration.getStates().has(remote.doc.clientID)).toBe(false);
    } finally {
      await local.destroy();
      await remote.destroy();
      jest.useRealTimers();
    }
  });
});

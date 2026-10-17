import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import * as Y from "yjs";
import type { CRDTDoc, Provider } from "../../types";
import { YjsDoc } from "../yjs-doc";

/**
 * Local sync protocol over BroadcastChannel.
 *
 * A joiner sends `sync-step1` with its state vector. Peers reply with
 * `sync-step2` (missing updates) and, when `expectReply` is set, their own
 * `sync-step1` so the joiner can return anything they still lack. This avoids
 * relying on a one-shot full-state broadcast, which BroadcastChannel drops when
 * no peer is listening yet.
 */
type BroadcastMessage =
  | { readonly type: "sync-step1"; readonly stateVector: Uint8Array; readonly expectReply: boolean }
  | { readonly type: "sync-step2"; readonly update: Uint8Array }
  | { readonly type: "update"; readonly update: Uint8Array }
  | { readonly type: "awareness"; readonly update: Uint8Array };

/**
 * Syncs Yjs documents on the same origin without a network server.
 *
 * Uses the browser {@link BroadcastChannel} API so two editors in one page,
 * or separate tabs on the same PC, converge when they share a room id.
 */
export class BroadcastChannelProvider implements Provider {
  /** Room-qualified identity so two broadcast rooms can attach to one document. */
  public readonly id: string;

  private channel: BroadcastChannel | null = null;
  private ydoc: Y.Doc | null = null;
  private awareness: Awareness | null = null;

  /**
   * Creates a local same-origin sync provider.
   *
   * @param roomId - Shared channel name; peers must use the same value.
   */
  constructor(private readonly roomId: string) {
    this.id = `broadcast:${roomId}`;
  }

  /**
   * Connects the provider to the given CRDT document and transient awareness channel.
   *
   * Increments the local presence clock for reconnect and announces document and
   * awareness state after installing listeners. It does not wait for remote peers.
   *
   * @param doc - The Yjs-backed CRDT document to connect to.
   * @returns A promise resolved after local listeners and the join handshake are installed.
   * @throws If the adapter is incompatible, already connected, or BroadcastChannel setup fails.
   */
  async connect(doc: CRDTDoc): Promise<void> {
    if (!(doc instanceof YjsDoc)) {
      throw new Error("Document is not a YjsDoc");
    }
    if (this.channel !== null) {
      throw new Error("Provider already connected");
    }

    this.ydoc = doc.doc;
    this.awareness = doc.collaboration.awareness;
    this.channel = new BroadcastChannel(`rivto:${this.roomId}`);
    this.ydoc.on("update", this.handleDocUpdate);
    this.awareness.on("update", this.handleAwarenessUpdate);
    // Listen before announcing so a same-tick peer reply is not dropped.
    this.channel.addEventListener("message", this.handleChannelMessage);
    this.awareness.setLocalState(this.awareness.getLocalState());
    this.channel.postMessage({
      type: "sync-step1",
      stateVector: Y.encodeStateVector(this.ydoc),
      expectReply: true,
    } satisfies BroadcastMessage);
  }

  /**
   * Disconnects the provider after sending a departure on this transport only.
   *
   * Other providers retain the document's local awareness state. The departure is
   * posted before listeners are removed and the channel is closed.
   *
   * @param doc - The Yjs-backed CRDT document to disconnect from.
   * @returns A promise resolved after local subscriptions and the channel are released.
   * @throws If the adapter is incompatible, disconnected, or posting the departure fails.
   */
  async disconnect(doc: CRDTDoc): Promise<void> {
    if (!(doc instanceof YjsDoc)) {
      throw new Error("Document is not a YjsDoc");
    }
    if (this.channel === null || this.ydoc === null) {
      throw new Error("Provider not connected");
    }

    if (this.awareness) {
      // Send departure only on this transport; other attached providers stay present.
      this.channel.postMessage({
        type: "awareness",
        update: encodeAwarenessUpdate(this.awareness, [this.awareness.clientID], new Map()),
      } satisfies BroadcastMessage);
      this.awareness.off("update", this.handleAwarenessUpdate);
      this.awareness = null;
    }
    this.ydoc.off("update", this.handleDocUpdate);
    this.channel.removeEventListener("message", this.handleChannelMessage);
    this.channel.close();
    this.channel = null;
    this.ydoc = null;
  }

  /**
   * Relays awareness heartbeats and changes without feeding them back to their source.
   *
   * @param changes - Client IDs whose presence changed or expired.
   * @param origin - Source transport used to suppress echo.
   * @returns Sends one transient message when this transport is connected.
   */
  private readonly handleAwarenessUpdate = (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ): void => {
    if (origin === this || !this.channel || !this.awareness) {
      return;
    }
    const clients = [...changes.added, ...changes.updated, ...changes.removed];
    this.channel.postMessage({
      type: "awareness",
      update: encodeAwarenessUpdate(this.awareness, clients),
    } satisfies BroadcastMessage);
  };

  /**
   * Broadcasts local Yjs updates while suppressing updates originating from this provider.
   *
   * @param update - Encoded local Yjs update to broadcast.
   * @param origin - Transaction origin used to suppress this provider's own updates.
   */
  private readonly handleDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === this || this.channel === null) {
      return;
    }
    this.channel.postMessage({ type: "update", update } satisfies BroadcastMessage);
  };

  /**
   * Responds to broadcast synchronization messages and applies remote updates using this provider as origin.
   *
   * @param event - Broadcast channel message carrying synchronization or update data.
   */
  private readonly handleChannelMessage = (event: MessageEvent<BroadcastMessage>): void => {
    if (this.ydoc === null || this.channel === null) {
      return;
    }
    const message = event.data;
    if (!message || typeof message !== "object" || !("type" in message)) {
      return;
    }

    if (message.type === "awareness") {
      if (this.awareness && message.update instanceof Uint8Array) {
        try {
          applyAwarenessUpdate(this.awareness, message.update, this);
        } catch {
          // Malformed transport data must not interrupt document synchronization.
        }
      }
      return;
    }
    if (message.type === "sync-step1") {
      if (this.awareness) {
        this.channel.postMessage({
          type: "awareness",
          update: encodeAwarenessUpdate(this.awareness, [...this.awareness.getStates().keys()]),
        } satisfies BroadcastMessage);
      }
      const update = Y.encodeStateAsUpdate(this.ydoc, new Uint8Array(message.stateVector));
      if (update.byteLength > 0) {
        this.channel.postMessage({ type: "sync-step2", update } satisfies BroadcastMessage);
      }
      if (message.expectReply) {
        this.channel.postMessage({
          type: "sync-step1",
          stateVector: Y.encodeStateVector(this.ydoc),
          expectReply: false,
        } satisfies BroadcastMessage);
      }
    } else if (message.type === "sync-step2" || message.type === "update") {
      Y.applyUpdate(this.ydoc, new Uint8Array(message.update), this);
    }
  };
}

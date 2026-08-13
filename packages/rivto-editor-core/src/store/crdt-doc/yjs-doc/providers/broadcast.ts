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
  | { readonly type: "update"; readonly update: Uint8Array };

/**
 * Syncs Yjs documents on the same origin without a network server.
 *
 * Uses the browser {@link BroadcastChannel} API so two editors in one page,
 * or separate tabs on the same PC, converge when they share a room id.
 */
export class BroadcastChannelProvider implements Provider {
  public readonly id = "broadcast";

  private channel: BroadcastChannel | null = null;
  private ydoc: Y.Doc | null = null;

  private readonly handleDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === this || this.channel === null) return;
    this.channel.postMessage({ type: "update", update } satisfies BroadcastMessage);
  };

  private readonly handleChannelMessage = (event: MessageEvent<BroadcastMessage>): void => {
    if (this.ydoc === null || this.channel === null) return;
    const message = event.data;
    if (!message || typeof message !== "object" || !("type" in message)) return;

    if (message.type === "sync-step1") {
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

  /**
   * Creates a local same-origin sync provider.
   *
   * @param roomId - Shared channel name; peers must use the same value.
   */
  constructor(private readonly roomId: string) {}

  /**
   * Connects the provider to the given CRDT document.
   *
   * @param doc - The CRDT document to connect to.
   * @returns A Promise that resolves when the connection is established.
   */
  async connect(doc: CRDTDoc): Promise<void> {
    if (!(doc instanceof YjsDoc)) {
      throw new Error("Document is not a YjsDoc");
    }
    if (this.channel !== null) {
      throw new Error("Provider already connected");
    }

    this.ydoc = doc.doc;
    this.channel = new BroadcastChannel(`rivto:${this.roomId}`);
    this.ydoc.on("update", this.handleDocUpdate);
    // Listen before announcing so a same-tick peer reply is not dropped.
    this.channel.addEventListener("message", this.handleChannelMessage);
    this.channel.postMessage({
      type: "sync-step1",
      stateVector: Y.encodeStateVector(this.ydoc),
      expectReply: true,
    } satisfies BroadcastMessage);
  }

  /**
   * Disconnects the provider from the given CRDT document.
   *
   * @param doc - The CRDT document to disconnect from.
   * @returns A Promise that resolves when the disconnection is complete.
   */
  async disconnect(doc: CRDTDoc): Promise<void> {
    if (!(doc instanceof YjsDoc)) {
      throw new Error("Document is not a YjsDoc");
    }
    if (this.channel === null || this.ydoc === null) {
      throw new Error("Provider not connected");
    }

    this.ydoc.off("update", this.handleDocUpdate);
    this.channel.removeEventListener("message", this.handleChannelMessage);
    this.channel.close();
    this.channel = null;
    this.ydoc = null;
  }
}

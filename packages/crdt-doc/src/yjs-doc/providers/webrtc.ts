import { CRDTDoc, Provider } from "../../types";
import { WebrtcProvider as YWebrtcProvider, ProviderOptions } from "y-webrtc";
import { YjsDoc } from "../yjs-doc";

export class WebRTCProvider implements Provider {
  /** Room-qualified identity so two WebRTC rooms can attach to one document. */
  public readonly id: string;

  private _provider: YWebrtcProvider | null = null;
  /**
   * Creates a new WebRTC provider for document and transient presence synchronization.
   *
   * The attached document owns awareness; callers configure transport options only.
   *
   * @param roomId - The room ID to connect to.
   * @param options - WebRTC transport options; awareness is supplied by the document.
   */
  constructor(
    private readonly roomId: string,
    private readonly options?: WebRTCProviderOptions,
  ) {
    this.id = `webrtc:${roomId}`;
  }
  /**
   * Connects the provider to the given CRDT document and its shared presence channel.
   *
   * Room initialization is awaited so immediate cleanup cannot race key derivation.
   * This does not wait for a remote peer or confirm network connectivity.
   *
   * @param doc - The Yjs-backed CRDT document to connect to.
   * @returns A promise resolved after room initialization has been scheduled by y-webrtc.
   * @throws If the adapter is incompatible, the provider is already connected, or initialization rejects.
   */
  async connect(doc: CRDTDoc): Promise<void> {
    if (!(doc instanceof YjsDoc)) {
      throw new Error("Document is not a YjsDoc");
    }
    if (this._provider) {
      throw new Error("Provider already connected");
    }
    this._provider = new YWebrtcProvider(this.roomId, doc.doc, {
      ...this.options,
      awareness: doc.collaboration.awareness,
    });
    await this._provider.key;
  }

  /**
   * Disconnects the provider while preserving the document's local presence for other transports.
   *
   * y-webrtc clears shared awareness during synchronous disconnect and asynchronous
   * room destruction. Restore the captured state after both lifecycle operations.
   * Pending transport messages are not awaited, and remote peers can briefly observe
   * departure before the surviving transport republishes the restored state.
   *
   * @param doc - The Yjs-backed CRDT document to disconnect from.
   * @returns A promise resolved after room teardown and local-awareness restoration.
   * @throws If the adapter is incompatible, the provider is disconnected, or teardown fails.
   */
  async disconnect(doc: CRDTDoc): Promise<void> {
    if (!(doc instanceof YjsDoc)) {
      throw new Error("Document is not a YjsDoc");
    }
    if (!this._provider) {
      throw new Error("Provider not connected");
    }
    const awareness = doc.collaboration.awareness;
    const state = awareness.getLocalState();
    this._provider.disconnect();
    this._provider.destroy();
    this._provider = null;
    // y-webrtc destroys its room asynchronously and removes local presence again.
    await Promise.resolve();
    awareness.setLocalState(state);
  }
}

export type WebRTCProviderOptions = Omit<ProviderOptions, "awareness">;

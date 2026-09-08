import { CRDTDoc, Provider } from "../../types";
import { WebrtcProvider as YWebrtcProvider, ProviderOptions } from 'y-webrtc'
import { YjsDoc } from "../yjs-doc";


export class WebRTCProvider implements Provider {
    /** Room-qualified identity so two WebRTC rooms can attach to one document. */
    public readonly id: string;

    private _provider: YWebrtcProvider | null = null;
    /**
     * Creates a new WebRTC provider.
     * @param roomId - The room ID to connect to.
     * @param options - The options to pass to the WebRTC provider.
     */
    constructor(private readonly roomId: string, private readonly options?: ProviderOptions) {
        this.id = `webrtc:${roomId}`;
    }
    /**
     * Connects the provider to the given CRDT document.
     * @param doc - The CRDT document to connect to.
     * @returns A Promise that resolves when the connection is established.
     */
    async connect(doc: CRDTDoc): Promise<void> {
        if (!(doc instanceof YjsDoc)) {
            throw new Error("Document is not a YjsDoc");
        }
        if (this._provider) {
            throw new Error("Provider already connected");
        }
        this._provider = new YWebrtcProvider(this.roomId, (doc as YjsDoc).doc, this.options);
    }

    /**
     * Disconnects the provider from the given CRDT document.
     * @param doc - The CRDT document to disconnect from.
     * @returns A Promise that resolves when the disconnection is complete.
     */
    async disconnect(doc: CRDTDoc): Promise<void> {
        if (!(doc instanceof YjsDoc)) {
            throw new Error("Document is not a YjsDoc");
        }
        if (!this._provider) {
            throw new Error("Provider not connected");
        }
        this._provider.disconnect();
        this._provider.destroy();
        this._provider = null;
    }
}

export type WebRTCProviderOptions = ProviderOptions;
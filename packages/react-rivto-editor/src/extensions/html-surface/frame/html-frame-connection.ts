/**
 * Host end of the private channel to one composed widget document.
 *
 * @module
 */
import {
  parseFrameMessage,
  postHostMessage,
  type HtmlFrameMessage,
  type HtmlHostMessage,
} from "../sandbox/frame-messages";
import { createIframeTextSelectionRelay } from "./iframe-text-selection";

/** Credentials baked into one composed `srcdoc`. */
export interface HtmlFrameCredentials {
  /** Secret required on every envelope in both directions. */
  readonly token: string;
  /** Separate secret for native text-selection reports, when the relay is installed. */
  readonly selectionKey?: string;
}

/** Callbacks through which the connection reports to its owner. */
export interface HtmlFrameConnectionHandlers {
  /**
   * Runs once each time a document realm connects (initial load or srcdoc reload).
   *
   * @returns The owner has posted its initial state through the connection.
   */
  readonly onConnect: () => void;
  /**
   * Receives every validated message from the connected document except `ready`.
   *
   * @param message - Parsed message.
   * @returns The owner has handled the message.
   */
  readonly onMessage: (message: HtmlFrameMessage) => void;
}

/**
 * Accepts the port a widget document transfers when its bridge starts and
 * routes messages over it until disposed.
 *
 * IMPORTANT: an iframe's `contentWindow` keeps its identity when a link or form
 * navigates it. The `ready` handshake is therefore authenticated by window *and*
 * token, and everything afterwards (snapshots, replies) goes through the
 * transferred port, which belongs to the authored document's realm only. A
 * message posted to `contentWindow` could reach the next page instead.
 */
export class HtmlFrameConnection {
  private port: MessagePort | null = null;
  /** Lifetime of the currently connected realm; aborts the text-selection relay. */
  private realm: AbortController | null = null;

  /**
   * Starts listening for the document's `ready` handshake.
   *
   * @param iframe - Frame whose window may announce the document.
   * @param credentials - Secrets of the composed document.
   * @param handlers - Owner callbacks.
   */
  constructor(
    private readonly iframe: HTMLIFrameElement,
    private readonly credentials: HtmlFrameCredentials,
    private readonly handlers: HtmlFrameConnectionHandlers,
  ) {
    window.addEventListener("message", this.onWindowMessage);
  }

  /**
   * Sends a message to the connected document.
   *
   * @param message - Message body; the envelope is added.
   * @returns The message is queued, or dropped when no document is connected yet.
   */
  post(message: HtmlHostMessage): void {
    if (this.port) {
      postHostMessage(this.port, this.credentials.token, message);
    }
  }

  /**
   * Stops listening, closes the port and releases the text-selection relay.
   *
   * @returns The connection can no longer send or receive.
   */
  dispose(): void {
    window.removeEventListener("message", this.onWindowMessage);
    this.disconnect();
  }

  /**
   * Accepts a `ready` handshake from this iframe's current document.
   *
   * @param event - Any window message; others are ignored.
   * @returns The new realm is connected when the handshake is valid.
   */
  private readonly onWindowMessage = (event: MessageEvent): void => {
    const endpoint = event.ports[0];
    if (
      event.source !== this.iframe.contentWindow ||
      !endpoint ||
      parseFrameMessage(event.data, this.credentials.token)?.kind !== "ready"
    ) {
      return;
    }
    // Reloading the same srcdoc starts a new realm with its own port.
    this.disconnect();
    this.realm = new AbortController();
    this.port = endpoint;
    endpoint.onmessage = this.createPortListener(endpoint, this.realm.signal);
    this.handlers.onConnect();
  };

  /**
   * Builds the message listener for one connected realm.
   *
   * @param endpoint - The realm's port.
   * @param signal - Aborted when the realm is replaced or the connection is disposed.
   * @returns A listener that ignores messages once the realm is no longer current.
   */
  private createPortListener(endpoint: MessagePort, signal: AbortSignal) {
    const { token, selectionKey } = this.credentials;
    const relayTextSelection = selectionKey
      ? createIframeTextSelectionRelay(this.iframe, selectionKey, signal)
      : undefined;
    return ({ data }: MessageEvent) => {
      if (this.port !== endpoint) {
        return;
      }
      // Text-selection reports use their own secret, not the frame envelope.
      if (relayTextSelection?.isReport(data)) {
        if (relayTextSelection.relay(data)) {
          this.post({ kind: "clear-text-selection" });
        }
        return;
      }
      const message = parseFrameMessage(data, token);
      if (message && message.kind !== "ready") {
        this.handlers.onMessage(message);
      }
    };
  }

  /**
   * Closes the current realm's port and aborts its lifetime.
   *
   * @returns No realm is connected.
   */
  private disconnect(): void {
    this.realm?.abort();
    this.realm = null;
    this.port?.close();
    this.port = null;
  }
}

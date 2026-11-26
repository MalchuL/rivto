/**
 * The editor's end of the private message channel to one widget page.
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

/** Secrets and limits baked into one composed widget page. */
export interface HtmlFrameDocument {
  /** Secret the page must include in every message, and that the editor includes in its replies. */
  readonly token: string;
  /** Separate secret for text-selection reports. Present only when the relay is installed. */
  readonly selectionKey?: string;
  /** Editor-pointer-region limit the page's script was built with; the parser enforces the same limit. */
  readonly maxEditorPointerRegions: number;
}

/** Callbacks through which the connection reports to its owner. */
export interface HtmlFrameConnectionHandlers {
  /**
   * Runs each time a page connects: on first load, and again if the iframe reloads it.
   *
   * @returns Nothing. The owner has posted the current node to the page.
   */
  readonly onConnect: () => void;
  /**
   * Receives every validated message from the connected page, except `ready`.
   *
   * @param message - The parsed message.
   * @returns Nothing. The owner has handled the message.
   */
  readonly onMessage: (message: HtmlFrameMessage) => void;
}

/**
 * Connects to one widget page and carries messages to and from it until disposed.
 *
 * How the connection is set up: when the page's bridge script starts, it
 * creates a `MessageChannel`, keeps one port, and sends the other to the
 * editor in a `ready` message. From then on every message in both directions
 * goes through that private port.
 *
 * IMPORTANT: this is a security boundary. An iframe keeps the same
 * `contentWindow` when a link or form inside it loads a different page. If the
 * editor replied through `contentWindow`, the next page would receive the
 * widget's data and, for Unsafe HTML, its editor access. So:
 * - `ready` is accepted only from this iframe's window *and* with this page's token;
 * - all replies go through the transferred port, which belongs to the page
 *   that sent `ready` and is closed when that page unloads.
 *
 * Each page load is a separate JavaScript environment (a "realm"). Reloading
 * the same `srcdoc` creates a new realm with a new port; the connection
 * switches to it and closes the old one.
 */
export class HtmlFrameConnection {
  /** Port of the currently connected page, or null before `ready` and after dispose. */
  private port: MessagePort | null = null;
  /** Aborted when the connected page is replaced or the connection is disposed. */
  private realm: AbortController | null = null;

  /**
   * Starts listening for the page's `ready` message.
   *
   * @param iframe - The iframe whose window may send `ready`.
   * @param frameDocument - Secrets and limits of the composed page.
   * @param handlers - Callbacks to the owner.
   */
  constructor(
    private readonly iframe: HTMLIFrameElement,
    private readonly frameDocument: HtmlFrameDocument,
    private readonly handlers: HtmlFrameConnectionHandlers,
  ) {
    window.addEventListener("message", this.onWindowMessage);
  }

  /**
   * Sends a message to the connected page.
   *
   * @param message - Message body; the namespace and token are added.
   * @returns Nothing. The message is queued on the port, or dropped if no page is connected yet.
   */
  post(message: HtmlHostMessage): void {
    if (this.port) {
      postHostMessage(this.port, this.frameDocument.token, message);
    }
  }

  /**
   * Stops listening, closes the port and releases the text-selection relay.
   *
   * @returns Nothing. The connection can no longer send or receive.
   */
  dispose(): void {
    window.removeEventListener("message", this.onWindowMessage);
    this.disconnect();
  }

  /**
   * Connects to the page that sent a valid `ready` message.
   *
   * @param event - Any message delivered to the editor window; others are ignored.
   * @returns Nothing. The page is connected if the message was a valid `ready`.
   */
  private readonly onWindowMessage = (event: MessageEvent): void => {
    const port = event.ports[0];
    if (!port || !this.isReadyFromThisPage(event)) {
      return;
    }
    this.disconnect();
    this.realm = new AbortController();
    this.port = port;
    port.onmessage = this.createPortListener(port, this.realm.signal);
    this.handlers.onConnect();
  };

  /**
   * Checks that a window message is this page's `ready` handshake.
   *
   * @param event - A message delivered to the editor window.
   * @returns True when it comes from this iframe's window and carries this page's token.
   */
  private isReadyFromThisPage(event: MessageEvent): boolean {
    const { token, maxEditorPointerRegions } = this.frameDocument;
    return (
      event.source === this.iframe.contentWindow &&
      parseFrameMessage(event.data, token, maxEditorPointerRegions)?.kind === "ready"
    );
  }

  /**
   * Builds the port listener for one connected page.
   *
   * Text-selection reports are authenticated with their own secret and handled
   * here. Everything else is validated by the message parser and passed to
   * the owner.
   *
   * @param port - The page's port.
   * @param signal - Aborted when the page is replaced or the connection is disposed.
   * @returns A listener that ignores messages once this page is no longer the connected one.
   */
  private createPortListener(port: MessagePort, signal: AbortSignal) {
    const { token, selectionKey, maxEditorPointerRegions } = this.frameDocument;
    const textSelection = selectionKey
      ? createIframeTextSelectionRelay(this.iframe, selectionKey, signal)
      : undefined;
    return ({ data }: MessageEvent) => {
      if (this.port !== port) {
        return;
      }
      if (textSelection?.isReport(data)) {
        // When Page took over the drag as a block selection, clear the
        // widget's own text highlight so only one selection is visible.
        if (textSelection.relay(data)) {
          this.post({ kind: "clear-text-selection" });
        }
        return;
      }
      const message = parseFrameMessage(data, token, maxEditorPointerRegions);
      if (message && message.kind !== "ready") {
        this.handlers.onMessage(message);
      }
    };
  }

  /**
   * Closes the connected page's port and aborts its lifetime signal.
   *
   * @returns Nothing. No page is connected.
   */
  private disconnect(): void {
    this.realm?.abort();
    this.realm = null;
    this.port?.close();
    this.port = null;
  }
}

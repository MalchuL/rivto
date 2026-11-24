/**
 * Sandboxed iframe that paints authored HTML and exchanges the live node.
 *
 * @module
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { EmbeddedDragHandles } from "../../../components/embedded-drag-handles";
import type {
  EmbeddedContentContext,
  EmbeddedDragHandleRegion,
} from "../../../components/embedded-content-context";
import {
  clampFrameHeight,
  composeSrcDoc,
  HTML_CHANNEL,
  parseFrameMessage,
  type HtmlWidgetCommand,
  type HtmlFrameFit,
  type HtmlNodeData,
} from "../protocol/protocol";

import {
  executeUnsafeHtmlRequest,
  parseUnsafeHtmlRequest,
  unsafeHtmlRuntime,
  type UnsafeHtmlBlocks,
  type UnsafeHtmlRequest,
} from "../unsafe-bridge";

/** Host-controlled capabilities for an unsafe HTML block. */
export interface UnsafeHtmlFrameAccess {
  /** Whether this source has been approved for editor access. */
  readonly enabled: boolean;
  /** Panel-bounded block operations. */
  readonly panelBlocks: UnsafeHtmlBlocks;
  /** Shared document block operations. */
  readonly editorBlocks: UnsafeHtmlBlocks;
  /**
   * Checks that the original source is still authorized at request time.
   *
   * @returns True only while this source retains its current grant.
   */
  readonly isAuthorized: () => boolean;
  /**
   * Reports an attempt to access a disabled capability.
   *
   * @returns The host has recorded the attempt.
   */
  readonly onDenied: () => void;
}

/** Props for one sandboxed HTML document. */
export interface HtmlFrameProps {
  /** Accessible name and iframe name, unique for seeded samples. */
  readonly frameName: string;
  /** Authored HTML fragment or complete document. */
  readonly source: string;
  /** Current node snapshot posted when the bridge connects and whenever the node changes. */
  readonly node: HtmlNodeData;
  /** Current surface and selection, synchronized separately from document data. */
  readonly context: EmbeddedContentContext;
  /** `fill` matches the host box. `auto` grows with the document. */
  readonly fit: HtmlFrameFit;
  /** Optional editor access supplied only by the unsafe block. */
  readonly unsafeAccess?: UnsafeHtmlFrameAccess;
  /** When false, property commands and host drag targets from the document are ignored. */
  readonly interactive: boolean;
  /**
   * Receives a validated command from this iframe.
   *
   * Resize, ready, and drag-region messages are handled here and are not forwarded.
   *
   * @param command - Pointer notification or property or content write from the sandbox.
   * @returns The recipient has processed the command.
   */
  readonly onCommand: (command: HtmlWidgetCommand) => void;
}

/**
 * Renders authored HTML in a script-capable iframe that cannot reach the parent origin.
 *
 * The document is rebuilt only when the source or fit changes. Property updates are
 * posted into the existing document so a running timer is not reset.
 *
 * @param props - Source, node snapshot, and command callback.
 * @param props.frameName - Accessible title and window name.
 * @param props.source - HTML written into the iframe document.
 * @param props.node - Snapshot delivered to `rivto.node`.
 * @param props.context - Current surface and selection delivered separately.
 * @param props.fit - Whether the iframe fills its host or grows with the document.
 * @param props.unsafeAccess - Host-controlled unsafe access, absent for ordinary widgets.
 * @param props.interactive - Whether writes and host drag regions are enabled.
 * @param props.onCommand - Invoked for a validated pointer notification or write from this iframe.
 * @returns The iframe and any explicitly declared host drag targets.
 */
export function HtmlFrame({
  frameName,
  source,
  node,
  context,
  fit,
  interactive,
  onCommand,
  unsafeAccess,
}: HtmlFrameProps) {
  const { iframeRef, srcDoc, height, dragHandles } = useHtmlFrame({
    source,
    node,
    context,
    fit,
    interactive,
    onCommand,
    unsafeAccess,
  });

  const style = fit === "auto" ? { height } : undefined;
  return (
    <div
      className={
        fit === "fill" ? "html-frame-container html-frame-container-fill" : "html-frame-container"
      }
    >
      <iframe
        ref={iframeRef}
        className={
          fit === "fill" ? "html-surface-frame html-surface-frame-fill" : "html-surface-frame"
        }
        title={frameName}
        name={frameName}
        sandbox="allow-scripts allow-forms"
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        style={style}
      />
      {interactive && (
        <EmbeddedDragHandles regions={dragHandles} blockSelectionAnchor={node.kind === "block"} />
      )}
    </div>
  );
}

/**
 * Keeps the sandbox document and its live node snapshot synchronized.
 *
 * The listener accepts messages only from this iframe and is removed on cleanup.
 *
 * @param props - Source, sizing, snapshot, and validated command recipient.
 * @param props.source - Authored HTML source.
 * @param props.node - Current node snapshot.
 * @param props.context - Current surface and selection.
 * @param props.fit - Automatic height or host-relative sizing.
 * @param props.unsafeAccess - Host-controlled unsafe access, when installed.
 * @param props.interactive - Whether writes and drag regions are enabled.
 * @param props.onCommand - Receives validated pointer notifications and writes.
 * @returns Iframe reference, document source, automatic height and drag regions.
 */
function useHtmlFrame({
  source,
  node,
  context,
  fit,
  interactive,
  onCommand,
  unsafeAccess,
}: Omit<HtmlFrameProps, "frameName">) {
  const enabled = unsafeAccess?.enabled;
  const document = useMemo(() => {
    const token = crypto.randomUUID();
    const extra = enabled === undefined ? "" : unsafeHtmlRuntime(token, enabled);
    return { token, srcDoc: composeSrcDoc(source, token, fit, extra) };
  }, [source, fit, enabled]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const port = useRef<MessagePort | null>(null);
  const [height, setHeight] = useState(180);
  const [dragHandles, setDragHandles] = useState<readonly EmbeddedDragHandleRegion[]>([]);
  const latest = useRef({ node, context, unsafeAccess, interactive, onCommand });
  useLayoutEffect(() => {
    latest.current = { node, context, unsafeAccess, interactive, onCommand };
  });
  useLayoutEffect(() => {
    setDragHandles([]);
    return connectHtmlDocument(iframeRef.current, document.token, port, latest, (data) => {
      const command = parseFrameMessage(data, document.token);
      if (!command || command.kind === "ready") {
        return;
      }
      if (command.kind === "resize") {
        applyResize(fit, command.height, setHeight);
      } else if (command.kind === "drag-handles") {
        if (latest.current.interactive) {
          setDragHandles(command.handles);
        }
      } else if (latest.current.interactive) {
        latest.current.onCommand(command);
      }
    });
  }, [document, fit]);
  useEffect(() => {
    postHtmlNode(port.current, document.token, latest.current);
  }, [node, document]);
  useEffect(() => {
    port.current?.postMessage({
      channel: HTML_CHANNEL,
      token: document.token,
      kind: "context",
      context,
    });
  }, [context, document]);
  return { iframeRef, srcDoc: document.srcDoc, height, dragHandles };
}

/** Live render data and permission state borrowed by the document connection. */
type HtmlConnectionState = Pick<
  HtmlFrameProps,
  "node" | "context" | "unsafeAccess" | "interactive"
>;

/**
 * Sends the current node and presentation context to the authenticated document.
 *
 * The receiving port belongs to the script realm that announced readiness.
 * Following a link within the iframe never transfers that endpoint to its destination.
 *
 * @param port - Connected endpoint, or null before the ready message.
 * @param token - Secret generated for this source and permission state.
 * @param state - Most recently committed node and presentation state.
 * @returns The node snapshot has been posted when the endpoint exists.
 */
function postHtmlNode(
  port: MessagePort | null,
  token: string,
  state: Pick<HtmlFrameProps, "node" | "context">,
): void {
  port?.postMessage({
    channel: HTML_CHANNEL,
    token,
    kind: "node",
    node: { ...state.node, context: state.context },
  });
}

/**
 * Accepts a port transferred by the authored document when its bridge starts.
 *
 * Only the initial handshake uses the iframe window. Replies, snapshots and
 * later commands use the port, which remains bound to the original document
 * even if the iframe navigates before a reply is delivered.
 *
 * @param iframe - Mounted frame whose window may announce this document.
 * @param token - Per-document secret embedded in the authored srcdoc.
 * @param port - Endpoint owned by this connection and closed on teardown.
 * @param latest - Live occurrence state used to authorize requests and initialize subscribers.
 * @param onCommand - Routes ordinary messages through widget command validation.
 * @returns Cleanup that releases the window listener and closes the endpoint.
 */
function connectHtmlDocument(
  iframe: HTMLIFrameElement | null,
  token: string,
  port: { current: MessagePort | null },
  latest: RefObject<HtmlConnectionState>,
  onCommand: (data: unknown) => void,
): () => void {
  const connect = (event: MessageEvent) => {
    // IMPORTANT: contentWindow keeps the same identity when a link or form loads another page.
    // Authenticate the ready message with the source token and send snapshots and replies only
    // through its transferred port. A reply sent to contentWindow could reach the next page.
    if (
      event.source !== iframe?.contentWindow ||
      parseFrameMessage(event.data, token)?.kind !== "ready"
    ) {
      return;
    }
    const endpoint = event.ports[0];
    if (!endpoint) {
      return;
    }
    // Reloading the authored srcdoc starts a new realm with its own port.
    port.current?.close();
    port.current = endpoint;
    endpoint.onmessage = ({ data }) => {
      if (port.current !== endpoint) {
        return;
      }
      const { unsafeAccess, interactive } = latest.current;
      if (!handleUnsafeMessage(data, endpoint, token, unsafeAccess, interactive)) {
        onCommand(data);
      }
    };
    postHtmlNode(endpoint, token, latest.current);
  };
  window.addEventListener("message", connect);
  return () => {
    window.removeEventListener("message", connect);
    port.current?.close();
    port.current = null;
  };
}

/**
 * Responds to an unsafe request only from the connected document with current permission.
 *
 * @param data - Message received on the authenticated port.
 * @param port - Endpoint belonging to the document that requested access.
 * @param token - Secret identifying this srcdoc and its grant.
 * @param access - Live host-controlled capabilities, if provided.
 * @param interactive - Whether this is an interactive document occurrence.
 * @returns True for unsafe messages, including rejected requests.
 */
function handleUnsafeMessage(
  data: unknown,
  port: MessagePort,
  token: string,
  access: UnsafeHtmlFrameAccess | undefined,
  interactive: boolean,
): boolean {
  if (
    !access ||
    !data ||
    typeof data !== "object" ||
    !("channel" in data) ||
    data.channel !== HTML_CHANNEL ||
    !("token" in data) ||
    data.token !== token ||
    !("kind" in data)
  ) {
    return false;
  }
  if (data.kind === "unsafe-denied") {
    access.onDenied();
    return true;
  }
  if (data.kind !== "unsafe-request") {
    return false;
  }
  const request = parseUnsafeHtmlRequest(data);
  if (request) {
    respondToUnsafeRequest(port, token, access, interactive, request);
  }
  return true;
}

/**
 * Runs an authorized request and posts its result to the requesting document.
 *
 * Permission is checked again at execution time so a queued request cannot
 * retain a grant after a source edit or a switch to a noninteractive preview.
 *
 * @param port - The requesting document's connected endpoint.
 * @param token - Secret identifying this document.
 * @param access - Current permission and borrowed managers.
 * @param interactive - Whether this occurrence accepts writes.
 * @param request - Parsed request with untrusted arguments.
 * @returns A result or rejection has been posted to the original document.
 */
function respondToUnsafeRequest(
  port: MessagePort,
  token: string,
  access: UnsafeHtmlFrameAccess,
  interactive: boolean,
  request: UnsafeHtmlRequest,
): void {
  let value: unknown = null;
  let error: string | undefined;
  if (!interactive || !access.enabled || !access.isAuthorized()) {
    access.onDenied();
    error = "Editor access is disabled";
  } else {
    try {
      value = executeUnsafeHtmlRequest(
        request.target === "panel" ? access.panelBlocks : access.editorBlocks,
        request,
      );
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Editor operation failed";
    }
  }
  port.postMessage({
    channel: HTML_CHANNEL,
    token,
    kind: "unsafe-result",
    id: request.id,
    value,
    error,
  });
}

/**
 * Stores a reported document height for auto-sized frames.
 *
 * @param fit - Current sizing mode. Fill frames ignore the report.
 * @param reported - Scroll height from the sandbox, in CSS pixels.
 * @param setHeight - State setter for the iframe height.
 * @returns Updates the iframe height only when the clamped value differs.
 */
function applyResize(
  fit: HtmlFrameFit,
  reported: number,
  setHeight: (update: (current: number) => number) => void,
): void {
  if (fit !== "auto") {
    return;
  }
  const next = clampFrameHeight(reported);
  setHeight((current) => (current === next ? current : next));
}

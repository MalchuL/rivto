/**
 * Sandboxed iframe that paints authored HTML and exchanges the live node.
 *
 * @module
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
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
  /** Current node snapshot posted after the document loads and whenever it changes. */
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
  const token = useRef(crypto.randomUUID());
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const nodeRef = useRef(node);
  const contextRef = useRef(context);
  const [height, setHeight] = useState(180);
  const [dragHandles, setDragHandles] = useState<readonly EmbeddedDragHandleRegion[]>([]);
  const unsafeRef = useRef(unsafeAccess);
  unsafeRef.current = unsafeAccess;
  const srcDoc = useMemo(
    () =>
      composeSrcDoc(
        source,
        token.current,
        fit,
        unsafeAccess ? unsafeHtmlRuntime(token.current, unsafeAccess.enabled) : "",
      ),
    [source, fit, Boolean(unsafeAccess), unsafeAccess?.enabled],
  );
  nodeRef.current = node;
  contextRef.current = context;

  useEffect(() => setDragHandles([]), [srcDoc]);

  useHtmlNodeSync(iframeRef, nodeRef, contextRef, token, srcDoc, node);
  useHtmlContextSync(iframeRef, token, srcDoc, context);

  useHtmlMessages({
    iframeRef,
    token,
    unsafeRef,
    interactive,
    fit,
    onCommand,
    setHeight,
    setDragHandles,
  });

  return { iframeRef, srcDoc, height, dragHandles };
}

/** Dependencies of the iframe message subscription. */
interface HtmlMessageOptions {
  /** Currently mounted frame. */
  readonly iframeRef: RefObject<HTMLIFrameElement | null>;
  /** Secret identifying this frame. */
  readonly token: RefObject<string>;
  /** Current permission and borrowed managers. */
  readonly unsafeRef: RefObject<UnsafeHtmlFrameAccess | undefined>;
  /** Whether writes are accepted for this occurrence. */
  readonly interactive: boolean;
  /** Frame sizing policy. */
  readonly fit: HtmlFrameFit;
  /**
   * Applies a validated ordinary widget command.
   *
   * @param command - Command received from the frame.
   * @returns The owner has processed the command.
   */
  readonly onCommand: (command: HtmlWidgetCommand) => void;
  /**
   * Updates the measured frame height.
   *
   * @param update - Computes a new height from the current height.
   * @returns The height update has been scheduled.
   */
  readonly setHeight: (update: (current: number) => number) => void;
  /**
   * Replaces the validated regions exposed by this iframe.
   *
   * @param handles - Clipped iframe-relative drag regions.
   * @returns The region update has been scheduled.
   */
  readonly setDragHandles: (handles: readonly EmbeddedDragHandleRegion[]) => void;
}

/**
 * Subscribes to the mounted frame's commands and removes the listener on cleanup.
 *
 * @param options - Frame references, permission, and command recipients.
 * @param options.iframeRef - Current frame receiving replies.
 * @param options.token - Secret shared with the current frame.
 * @param options.unsafeRef - Current host-controlled permission and managers.
 * @param options.interactive - Whether this occurrence can submit writes.
 * @param options.fit - Whether height reports affect the frame.
 * @param options.onCommand - Receives ordinary widget commands.
 * @param options.setHeight - Applies automatic height updates.
 * @param options.setDragHandles - Updates validated drag regions.
 * @returns The listener remains active until its dependencies change or it unmounts.
 */
function useHtmlMessages({
  iframeRef,
  token,
  unsafeRef,
  interactive,
  fit,
  onCommand,
  setHeight,
  setDragHandles,
}: HtmlMessageOptions): void {
  useEffect(() => {
    const onMessage = (event: MessageEvent) =>
      applyHtmlMessage(event, {
        iframeRef,
        token,
        unsafeRef,
        interactive,
        fit,
        onCommand,
        setHeight,
        setDragHandles,
      });
    const iframe = iframeRef.current;
    const announce = () => {
      iframe?.contentWindow?.postMessage(
        { channel: HTML_CHANNEL, token: token.current, kind: "host-ready" },
        "*",
      );
      if (unsafeRef.current) {
        iframe?.contentWindow?.postMessage(
          { channel: HTML_CHANNEL, token: token.current, kind: "unsafe-host-ready" },
          "*",
        );
      }
    };
    window.addEventListener("message", onMessage);
    iframe?.addEventListener("load", announce);
    announce();
    return () => {
      window.removeEventListener("message", onMessage);
      iframe?.removeEventListener("load", announce);
    };
  }, [fit, interactive, onCommand]);
}

/**
 * Applies one message from the mounted frame after validating its source and token.
 *
 * @param event - Browser message received by the host.
 * @param options - Frame identity, permissions, and command recipients.
 * @returns The accepted message has been routed to its owner.
 */
function applyHtmlMessage(event: MessageEvent, options: HtmlMessageOptions): void {
  const { iframeRef, token, unsafeRef, interactive, fit, onCommand, setHeight, setDragHandles } =
    options;
  if (event.source !== iframeRef.current?.contentWindow) {
    return;
  }
  if (
    handleUnsafeMessage(event, iframeRef.current, token.current, unsafeRef.current, interactive)
  ) {
    return;
  }
  const command = parseFrameMessage(event.data, token.current);
  if (!command || command.kind === "ready") {
    return;
  }
  if (command.kind === "resize") {
    applyResize(fit, command.height, setHeight);
  } else if (command.kind === "drag-handles") {
    if (interactive) {
      setDragHandles(command.handles);
    }
  } else if (interactive) {
    onCommand(command);
  }
}

/**
 * Responds to an unsafe request only from the mounted frame with current permission.
 *
 * @param event - Browser message from the iframe.
 * @param iframe - Current frame, if mounted.
 * @param token - Secret identifying this frame.
 * @param access - Live host-controlled capabilities, if provided.
 * @param interactive - Whether this is an interactive document occurrence.
 * @returns True for unsafe messages, including rejected requests.
 */
function handleUnsafeMessage(
  event: MessageEvent,
  iframe: HTMLIFrameElement | null,
  token: string,
  access: UnsafeHtmlFrameAccess | undefined,
  interactive: boolean,
): boolean {
  const data = event.data;
  if (
    !access ||
    !data ||
    typeof data !== "object" ||
    data.channel !== HTML_CHANNEL ||
    data.token !== token
  ) {
    return false;
  }
  if (data.kind === "unsafe-ready") {
    iframe?.contentWindow?.postMessage(
      { channel: HTML_CHANNEL, token, kind: "unsafe-host-ready" },
      "*",
    );
    return true;
  }
  if (data.kind === "unsafe-denied") {
    access.onDenied();
    return true;
  }
  if (data.kind !== "unsafe-request") {
    return false;
  }
  const request = parseUnsafeHtmlRequest(data);
  if (!request || !iframe?.contentWindow) {
    return true;
  }
  respondToUnsafeRequest(iframe, token, access, interactive, request);
  return true;
}

/**
 * Runs an authorized request and posts its result to the requesting frame.
 *
 * @param iframe - The mounted requesting frame.
 * @param token - Secret identifying this frame.
 * @param access - Current permission and borrowed managers.
 * @param interactive - Whether this occurrence accepts writes.
 * @param request - Parsed request with untrusted arguments.
 * @returns A result or rejection has been posted to the frame.
 */
function respondToUnsafeRequest(
  iframe: HTMLIFrameElement,
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
  iframe.contentWindow?.postMessage(
    { channel: HTML_CHANNEL, token, kind: "unsafe-result", id: request.id, value, error },
    "*",
  );
}

/**
 * Posts the latest snapshot after frame load and whenever the node changes.
 *
 * @param iframeRef - Mounted sandbox frame.
 * @param nodeRef - Ref containing its latest snapshot.
 * @param contextRef - Ref containing the latest presentation state.
 * @param token - Secret identifying messages for this frame.
 * @param srcDoc - Current frame document, used to resubscribe after replacement.
 * @param node - Current snapshot, which triggers a fresh post.
 * @returns Installs a listener that is removed when the frame or snapshot changes.
 */
function useHtmlNodeSync(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  nodeRef: RefObject<HtmlNodeData>,
  contextRef: RefObject<EmbeddedContentContext>,
  token: RefObject<string>,
  srcDoc: string,
  node: HtmlNodeData,
): void {
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) {
      return;
    }
    const post = () => {
      iframe.contentWindow?.postMessage(
        {
          channel: HTML_CHANNEL,
          token: token.current,
          kind: "node",
          node: { ...nodeRef.current, context: contextRef.current },
        },
        "*",
      );
    };
    post();
    iframe.addEventListener("load", post);
    return () => iframe.removeEventListener("load", post);
  }, [srcDoc, node, iframeRef, nodeRef, contextRef, token]);
}

/**
 * Sends presentation-only changes without notifying document-data subscribers.
 *
 * The node load message includes the latest context, so a context sent before
 * iframe startup can be safely ignored by the new document.
 *
 * @param iframeRef - Mounted sandbox frame.
 * @param token - Secret identifying messages for this frame.
 * @param srcDoc - Frame document identity, including replacements.
 * @param context - Current surface, whole-item selection, and preview state.
 * @returns An effect that posts the latest context to the current frame after commit.
 */
function useHtmlContextSync(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  token: RefObject<string>,
  srcDoc: string,
  context: EmbeddedContentContext,
): void {
  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { channel: HTML_CHANNEL, token: token.current, kind: "context", context },
      "*",
    );
  }, [iframeRef, token, srcDoc, context]);
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

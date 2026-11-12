/**
 * Sandboxed iframe that paints authored HTML and exchanges the live node.
 *
 * @module
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  clampFrameHeight,
  composeSrcDoc,
  HTML_CHANNEL,
  parseFrameMessage,
  type HtmlFrameCommand,
  type HtmlFrameFit,
  type HtmlNodeView,
} from "../protocol/protocol";

/** Props for one sandboxed HTML document. */
export interface HtmlFrameProps {
  /** Accessible name and iframe name, unique for seeded samples. */
  readonly frameName: string;
  /** Authored HTML fragment or complete document. */
  readonly source: string;
  /** Current node snapshot posted after the document loads and whenever it changes. */
  readonly node: HtmlNodeView;
  /** `fill` matches the host box. `auto` grows with the document. */
  readonly fit: HtmlFrameFit;
  /** When false, property commands from the document are ignored. */
  readonly interactive: boolean;
  /**
   * Receives a validated command from this iframe.
   *
   * Resize and ready messages are handled here and are not forwarded.
   *
   * @param command - Property or content write from the sandbox.
   * @returns The recipient has processed the command.
   */
  readonly onCommand: (command: HtmlFrameCommand) => void;
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
 * @param props.fit - Whether the iframe fills its host or grows with the document.
 * @param props.interactive - Whether property commands may leave the sandbox.
 * @param props.onCommand - Invoked for a validated write from this iframe.
 * @returns The iframe element.
 */
export function HtmlFrame({
  frameName,
  source,
  node,
  fit,
  interactive,
  onCommand,
}: HtmlFrameProps) {
  const { iframeRef, srcDoc, height } = useHtmlFrame({ source, node, fit, interactive, onCommand });

  const style = fit === "auto" ? { height } : undefined;
  return (
    <iframe
      ref={iframeRef}
      className={
        fit === "fill" ? "html-surface-frame html-surface-frame-fill" : "html-surface-frame"
      }
      title={frameName}
      name={frameName}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      style={style}
    />
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
 * @param props.fit - Automatic height or host-relative sizing.
 * @param props.interactive - Whether writes are forwarded.
 * @param props.onCommand - Receives validated writes.
 * @returns Iframe reference, document source, and current automatic height.
 */
function useHtmlFrame({
  source,
  node,
  fit,
  interactive,
  onCommand,
}: Omit<HtmlFrameProps, "frameName">) {
  const token = useRef(crypto.randomUUID());
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const nodeRef = useRef(node);
  const [height, setHeight] = useState(180);
  const srcDoc = useMemo(() => composeSrcDoc(source, token.current, fit), [source, fit]);
  nodeRef.current = node;

  useHtmlNodeSync(iframeRef, nodeRef, token, srcDoc, node);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }
      const command = parseFrameMessage(event.data, token.current);
      if (!command || command.kind === "ready") {
        return;
      }
      if (command.kind === "resize") {
        applyResize(fit, command.height, setHeight);
        return;
      }
      if (interactive) {
        onCommand(command);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [fit, interactive, onCommand]);

  return { iframeRef, srcDoc, height };
}

/**
 * Posts the latest snapshot after frame load and whenever the node changes.
 *
 * @param iframeRef - Mounted sandbox frame.
 * @param nodeRef - Ref containing its latest snapshot.
 * @param token - Secret identifying messages for this frame.
 * @param srcDoc - Current frame document, used to resubscribe after replacement.
 * @param node - Current snapshot, which triggers a fresh post.
 * @returns Installs a listener that is removed when the frame or snapshot changes.
 */
function useHtmlNodeSync(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  nodeRef: RefObject<HtmlNodeView>,
  token: RefObject<string>,
  srcDoc: string,
  node: HtmlNodeView,
): void {
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) {
      return;
    }
    const post = () => {
      iframe.contentWindow?.postMessage(
        { channel: HTML_CHANNEL, token: token.current, kind: "node", node: nodeRef.current },
        "*",
      );
    };
    post();
    iframe.addEventListener("load", post);
    return () => iframe.removeEventListener("load", post);
  }, [srcDoc, node, iframeRef, nodeRef, token]);
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
  setHeight((current) => (Math.abs(current - next) < 2 ? current : next));
}

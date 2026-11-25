/**
 * Keeps one sandboxed widget document in sync with its node.
 *
 * @module
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { MAX_AUTO_FRAME_HEIGHT } from "../constants";
import { composeSrcDoc } from "../sandbox/compose-src-doc";
import type { HtmlFrameMessage } from "../sandbox/frame-messages";
import type {
  HtmlDragHandleRegion,
  HtmlFrameFit,
  HtmlNodeData,
  HtmlWidgetCommand,
  HtmlWidgetContext,
} from "../types";
import { answerUnsafeHtmlRequest, type UnsafeHtmlFrameAccess } from "../unsafe/unsafe-requests";
import { HtmlFrameConnection } from "./html-frame-connection";

/** Initial height of an auto-sized frame before its document reports one. */
const INITIAL_AUTO_HEIGHT = 180;

/** Inputs of {@link useHtmlFrame}. */
export interface UseHtmlFrameOptions {
  /** Authored HTML; changing it rebuilds the document. */
  readonly source: string;
  /** Document data, posted whenever it changes without rebuilding the document. */
  readonly node: HtmlNodeData;
  /** Presentation, posted separately so selection changes don't look like data changes. */
  readonly context: HtmlWidgetContext;
  /** Sizing mode; changing it rebuilds the document. */
  readonly fit: HtmlFrameFit;
  /** When false, widget commands and drag regions are ignored (e.g. placement previews). */
  readonly interactive: boolean;
  /** Editor access for an Unsafe HTML block; changing `enabled` rebuilds the document. */
  readonly unsafeAccess?: UnsafeHtmlFrameAccess;
  /**
   * Receives validated pointer notifications and writes from the widget.
   *
   * @param command - Command from an interactive occurrence.
   * @returns The owner has applied the command.
   */
  readonly onCommand: (command: HtmlWidgetCommand) => void;
}

/** What the frame component renders. */
export interface UseHtmlFrameResult {
  readonly iframeRef: RefObject<HTMLIFrameElement | null>;
  readonly srcDoc: string;
  /** Height for `auto` frames, in CSS pixels. */
  readonly height: number;
  readonly dragRegions: readonly HtmlDragHandleRegion[];
}

/**
 * Composes the widget document, connects to it, and keeps it updated.
 *
 * The document is rebuilt only when `source`, `fit`, the unsafe grant, or the
 * need for a text-selection relay changes; node and context updates are posted
 * into the running document so widget state (timers, focus) survives. Each
 * rebuild gets fresh secrets, which revokes the old document's connection.
 *
 * Callbacks and access are read from the latest render at message time, so
 * a revoked grant is honored even for requests queued before the change.
 *
 * @param options - Source, node, presentation and owner callbacks.
 * @returns Values for the iframe element and its drag-region overlay.
 */
export function useHtmlFrame(options: UseHtmlFrameOptions): UseHtmlFrameResult {
  const { source, node, context, fit, interactive, unsafeAccess } = options;
  const unsafeAccessEnabled = unsafeAccess?.enabled;
  const relayTextSelection = interactive && node.kind === "block";
  const document = useMemo(() => {
    const token = crypto.randomUUID();
    const selectionKey = relayTextSelection ? crypto.randomUUID() : undefined;
    const srcDoc = composeSrcDoc({ source, token, fit, selectionKey, unsafeAccessEnabled });
    return { token, selectionKey, srcDoc };
  }, [source, fit, unsafeAccessEnabled, relayTextSelection]);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const connectionRef = useRef<HtmlFrameConnection | null>(null);
  const [height, setHeight] = useState(INITIAL_AUTO_HEIGHT);
  const [dragRegions, setDragRegions] = useState<readonly HtmlDragHandleRegion[]>([]);
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });

  useLayoutEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) {
      return undefined;
    }
    setDragRegions([]);
    const postNode = () => {
      const { node, context } = latest.current;
      connection.post({ kind: "node", node: { ...node, context } });
    };
    const connection = new HtmlFrameConnection(iframe, document, {
      onConnect: postNode,
      onMessage: (message) => {
        handleFrameMessage(message, latest.current, connection, { setHeight, setDragRegions });
      },
    });
    connectionRef.current = connection;
    return () => {
      connection.dispose();
      connectionRef.current = null;
    };
  }, [document]);

  useEffect(() => {
    connectionRef.current?.post({
      kind: "node",
      node: { ...node, context: latest.current.context },
    });
  }, [node, document]);
  useEffect(() => {
    connectionRef.current?.post({ kind: "context", context });
  }, [context, document]);

  return { iframeRef, srcDoc: document.srcDoc, height, dragRegions };
}

/** React state the message handler writes. */
interface FrameStateSetters {
  readonly setHeight: (update: (current: number) => number) => void;
  readonly setDragRegions: (regions: readonly HtmlDragHandleRegion[]) => void;
}

/**
 * Routes one validated message from the widget document.
 *
 * @param message - Parsed message (never `ready`, which the connection consumes).
 * @param current - Latest render's options.
 * @param connection - Connection to reply on.
 * @param state - Setters for frame height and drag regions.
 * @returns The message has been applied, answered or ignored.
 */
function handleFrameMessage(
  message: HtmlFrameMessage,
  current: UseHtmlFrameOptions,
  connection: HtmlFrameConnection,
  state: FrameStateSetters,
): void {
  switch (message.kind) {
    case "ready":
      return;
    case "resize": {
      if (current.fit === "auto") {
        const next = clampFrameHeight(message.height);
        state.setHeight((previous) => (previous === next ? previous : next));
      }
      return;
    }
    case "drag-handles":
      if (current.interactive) {
        state.setDragRegions(message.handles);
      }
      return;
    case "unsafe-denied":
      current.unsafeAccess?.onDenied();
      return;
    case "unsafe-request":
      if (current.unsafeAccess) {
        const result = answerUnsafeHtmlRequest(
          current.unsafeAccess,
          current.interactive,
          message.request,
        );
        connection.post({ kind: "unsafe-result", ...result });
      }
      return;
    default:
      if (current.interactive) {
        current.onCommand(message);
      }
  }
}

/**
 * Bounds a reported document height so a runaway widget cannot grow without limit.
 *
 * @param height - Height reported by the document, in CSS pixels.
 * @returns A rounded height from zero through {@link MAX_AUTO_FRAME_HEIGHT}.
 */
export function clampFrameHeight(height: number): number {
  return Math.min(MAX_AUTO_FRAME_HEIGHT, Math.max(0, Math.round(height)));
}

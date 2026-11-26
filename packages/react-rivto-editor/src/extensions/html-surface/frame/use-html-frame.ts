/**
 * Keeps one widget page in sync with its block or element.
 *
 * @module
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { HtmlSurfaceLimits } from "../options";
import { composeSrcDoc } from "../sandbox/compose-src-doc";
import type { HtmlFrameMessage, HtmlHostMessage } from "../sandbox/frame-messages";
import type {
  HtmlDragHandleRegion,
  HtmlFrameFit,
  HtmlNodeData,
  HtmlWidgetCommand,
  HtmlWidgetContext,
} from "../types";
import { answerUnsafeHtmlRequest, type UnsafeHtmlFrameAccess } from "../unsafe/unsafe-requests";
import { HtmlFrameConnection, type HtmlFrameDocument } from "./html-frame-connection";

/** Height of an auto-sized frame until its page reports one, in CSS pixels. */
const INITIAL_AUTO_HEIGHT = 180;

/** Inputs of {@link useHtmlFrame}. */
export interface UseHtmlFrameOptions {
  /** The widget's HTML. Changing it rebuilds the page. */
  readonly source: string;
  /** Document data. Changes are posted into the running page. */
  readonly node: HtmlNodeData;
  /**
   * Presentation (surface, selection, preview). Posted separately from `node`,
   * so a selection change does not look like a data change to the widget.
   */
  readonly context: HtmlWidgetContext;
  /** `auto` grows with the content (Page); `fill` fills the host box (canvas). Changing it rebuilds the page. */
  readonly fit: HtmlFrameFit;
  /** Whether widget writes and drag handles are enabled. False for placement previews. */
  readonly interactive: boolean;
  /**
   * Frame limits of the extension installation. `maxDragRegions` is baked into
   * the page, so changing it rebuilds the page; `maxBlockHeight` caps `auto` frames.
   */
  readonly limits: HtmlSurfaceLimits;
  /** Editor access for an Unsafe HTML block. Changing `enabled` rebuilds the page. */
  readonly unsafeAccess?: UnsafeHtmlFrameAccess;
  /**
   * Receives pointer notifications and writes from the widget, already validated.
   * Not called for non-interactive occurrences.
   *
   * @param command - The command.
   * @returns Nothing. The owner has applied the command.
   */
  readonly onCommand?: (command: HtmlWidgetCommand) => void;
}

/** What {@link HtmlFrame} needs to render. */
export interface UseHtmlFrameResult {
  /** Ref to attach to the iframe; the connection listens for its window. */
  readonly iframeRef: RefObject<HTMLIFrameElement | null>;
  /** The page to load into the iframe's `srcdoc`. */
  readonly srcDoc: string;
  /** Height for `auto` frames, in CSS pixels. Ignored by `fill` frames. */
  readonly height: number;
  /** Where to draw drag handles, as reported by the widget. */
  readonly dragRegions: readonly HtmlDragHandleRegion[];
}

/**
 * Builds the widget page, connects to it, and keeps it up to date.
 *
 * What rebuilds the page and what does not:
 * - Rebuilt: `source`, `fit`, `limits.maxDragRegions`, the unsafe grant, or
 *   whether a text-selection relay is needed. Each rebuild gets new secrets,
 *   which cuts off the old page's connection.
 * - Posted into the running page: `node` and `context`. Widget state such as
 *   a running timer or focus survives.
 *
 * Message handlers always read the latest props, not the ones from when the
 * page was built. That is what lets a revoked grant refuse requests that were
 * queued before the revocation.
 *
 * @param options - Source, node, presentation, limits and the command handler.
 * @returns What the frame component renders.
 */
export function useHtmlFrame(options: UseHtmlFrameOptions): UseHtmlFrameResult {
  const { node, context } = options;
  const frameDocument = useFrameDocument(options);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const connectionRef = useRef<HtmlFrameConnection | null>(null);
  const [height, setHeight] = useState(INITIAL_AUTO_HEIGHT);
  const [dragRegions, setDragRegions] = useState<readonly HtmlDragHandleRegion[]>([]);

  // Message handlers outlive renders; they read the newest options through this ref.
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });

  // Connect to each new page. The connection sends the current node as soon as
  // the page's bridge is ready, so no update can be lost before that.
  useLayoutEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) {
      return undefined;
    }
    setDragRegions([]);
    const connection = new HtmlFrameConnection(iframe, frameDocument, {
      onConnect: () => connection.post(nodeMessage(latest.current)),
      onMessage: (message) =>
        handleFrameMessage(message, latest.current, connection, { setHeight, setDragRegions }),
    });
    connectionRef.current = connection;
    return () => {
      connection.dispose();
      connectionRef.current = null;
    };
  }, [frameDocument]);

  useEffect(() => {
    connectionRef.current?.post(nodeMessage(latest.current));
  }, [node, frameDocument]);
  useEffect(() => {
    connectionRef.current?.post({ kind: "context", context });
  }, [context, frameDocument]);

  return { iframeRef, srcDoc: frameDocument.srcDoc, height, dragRegions };
}

/** A composed page and the secrets and limits baked into it. */
interface ComposedFrameDocument extends HtmlFrameDocument {
  /** The page to load into the iframe's `srcdoc`. */
  readonly srcDoc: string;
}

/**
 * Composes the widget page, recomposing only when something baked into it changes.
 *
 * Every composition gets a fresh token, and a fresh text-selection key when
 * the relay is needed (interactive Page blocks only).
 *
 * @param options - The frame options; only the fields baked into the page are read.
 * @returns The page with its secrets and drag-region limit.
 */
function useFrameDocument(options: UseHtmlFrameOptions): ComposedFrameDocument {
  const { source, fit, interactive } = options;
  const { maxDragRegions } = options.limits;
  const unsafeAccessEnabled = options.unsafeAccess?.enabled;
  const relayTextSelection = interactive && options.node.kind === "block";
  return useMemo(() => {
    const token = crypto.randomUUID();
    const selectionKey = relayTextSelection ? crypto.randomUUID() : undefined;
    const srcDoc = composeSrcDoc({
      source,
      token,
      fit,
      maxDragRegions,
      selectionKey,
      unsafeAccessEnabled,
    });
    return { token, selectionKey, maxDragRegions, srcDoc };
  }, [source, fit, maxDragRegions, unsafeAccessEnabled, relayTextSelection]);
}

/**
 * Builds the message that delivers the current node and its context to the widget.
 *
 * @param options - The latest frame options.
 * @param options.node - Document data of the block or element.
 * @param options.context - Current presentation.
 * @returns A `node` message; the widget sees its payload as `rivto.node`.
 */
function nodeMessage({ node, context }: UseHtmlFrameOptions): HtmlHostMessage {
  return { kind: "node", node: { ...node, context } };
}

/** React state setters the message handler writes to. */
interface FrameStateSetters {
  /**
   * Updates the frame height.
   *
   * @param update - Receives the current height and returns the new one.
   * @returns Nothing.
   */
  readonly setHeight: (update: (current: number) => number) => void;
  /**
   * Replaces the drag regions.
   *
   * @param regions - Regions reported by the widget.
   * @returns Nothing.
   */
  readonly setDragRegions: (regions: readonly HtmlDragHandleRegion[]) => void;
}

/**
 * Handles one validated message from the widget page.
 *
 * - `resize`: sets the height of `auto` frames, capped at `maxBlockHeight`.
 * - `drag-handles`: replaces the drag regions of interactive occurrences.
 * - `unsafe-denied` / `unsafe-request`: reports a refused access attempt, or
 *   answers an editor-access request. Only Unsafe HTML blocks handle these.
 * - Anything else is a widget command, passed to `onCommand` when interactive.
 *
 * @param message - The parsed message. `ready` never arrives here; the connection handles it.
 * @param current - The latest frame options.
 * @param connection - Connection used to answer access requests.
 * @param state - Setters for the frame height and drag regions.
 * @returns Nothing. The message has been applied, answered or ignored.
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
        const next = clampFrameHeight(message.height, current.limits.maxBlockHeight);
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
        const { unsafeAccess, interactive } = current;
        const result = answerUnsafeHtmlRequest(unsafeAccess, interactive, message.request);
        connection.post({ kind: "unsafe-result", ...result });
      }
      return;
    default:
      if (current.interactive) {
        current.onCommand?.(message);
      }
  }
}

/**
 * Limits a reported page height, so a runaway widget cannot grow its block without bound.
 *
 * @param height - Height reported by the page, in CSS pixels.
 * @param maxHeight - The configured `maxBlockHeight`, in CSS pixels.
 * @returns The height rounded to whole pixels, from 0 through `maxHeight`.
 */
export function clampFrameHeight(height: number, maxHeight: number): number {
  return Math.min(maxHeight, Math.max(0, Math.round(height)));
}

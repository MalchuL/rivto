/**
 * Data shapes shared by the HTML surface's host components and its sandbox protocol.
 *
 * @module
 */
import type { EditorMode } from "@chulane/rivto";

/**
 * Presentation of the block or element occurrence hosting a widget.
 *
 * Scripts read it as `rivto.context` and observe changes with `rivto.subscribeContext`.
 */
export interface HtmlWidgetContext {
  /** Actual surface containing this occurrence, including nested surfaces. */
  readonly mode: EditorMode;
  /** Whether the whole owning block or canvas element is selected (not text selection). */
  readonly selected: boolean;
  /** Whether this is a detached creation preview that cannot write to the document. */
  readonly preview: boolean;
}

/**
 * Rectangle where a press starts a host gesture (moving the block or element)
 * instead of reaching the widget. All fields are fractions of the iframe viewport.
 */
export interface HtmlDragHandleRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** How the sandboxed document sizes itself: `fill` the host box, or `auto` grow with content. */
export type HtmlFrameFit = "auto" | "fill";

/** Block fields a widget can read. `content` is the authored HTML. */
export interface HtmlBlockView {
  readonly kind: "block";
  readonly id: string;
  readonly type: string;
  readonly content: string;
  readonly props: Record<string, unknown>;
  readonly listProps: Record<string, unknown>;
  readonly pluginData: Record<string, unknown>;
  readonly childIds: readonly string[];
  /** Presentation of this mounted block occurrence. */
  readonly context: HtmlWidgetContext;
}

/** Element fields a widget can read. `props.html` is the authored HTML. */
export interface HtmlElementView {
  readonly kind: "element";
  readonly id: string;
  readonly type: string;
  readonly frame: { x: number; y: number; width: number; height: number };
  readonly zIndex: number;
  readonly props: Record<string, unknown>;
  readonly childIds: readonly string[];
  /** Presentation of this mounted element occurrence. */
  readonly context: HtmlWidgetContext;
}

/** Snapshot posted into the sandbox. Scripts see this object as `rivto.node`. */
export type HtmlNodeView = HtmlBlockView | HtmlElementView;

/** Detached document data; the frame adds the live presentation context when posting. */
export type HtmlNodeData = Omit<HtmlBlockView, "context"> | Omit<HtmlElementView, "context">;

/** Pointer notification or document write that a widget sends to its owning node. */
export type HtmlWidgetCommand =
  | { readonly kind: "pointerdown"; readonly primary: boolean }
  | { readonly kind: "set-prop"; readonly key: string; readonly value: unknown }
  | { readonly kind: "set-props"; readonly props: Record<string, unknown> }
  | { readonly kind: "set-list-props"; readonly listProps: Record<string, unknown> }
  | { readonly kind: "set-content"; readonly content: string };

/** Result of the source editor: the new source and the property edits made in the session. */
export interface HtmlDraft {
  /** Source shown when editing began; used to tell an intentional source edit from none. */
  readonly openingSource: string;
  /** Source at the time of saving. */
  readonly source: string;
  /** Top-level property additions, replacements and deletions (`undefined`). */
  readonly propsPatch: Record<string, unknown>;
}

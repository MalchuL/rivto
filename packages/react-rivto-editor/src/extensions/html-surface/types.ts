/**
 * Data shapes shared by the editor-side components and the widget message protocol.
 *
 * `HtmlBlockView`, `HtmlElementView` and `HtmlWidgetContext` are what widget
 * scripts receive (`rivto.node`, `rivto.context`), so they are part of the
 * public widget API.
 *
 * @module
 */
import type { EditorMode } from "@chulane/rivto";

/**
 * Presentation of the block or element showing a widget.
 *
 * Widget scripts read it as `rivto.context` and observe changes with
 * `rivto.subscribeContext`.
 */
export interface HtmlWidgetContext {
  /** Surface the widget is shown on: `"block"` (Page) or `"edgeless"` (canvas), including nested surfaces. */
  readonly mode: EditorMode;
  /** Whether the whole block or element is selected. Text selection inside the widget does not count. */
  readonly selected: boolean;
  /** Whether this occurrence previews an editing draft or placement of a new canvas element. Previews cannot write. */
  readonly preview: boolean;
}

/**
 * One area of a widget where a press goes to the editor surface instead of the widget.
 *
 * The widget page measures these regions and reports them; the editor lays a
 * transparent target over each one (see `frame/html-editor-pointer-targets.tsx`).
 * On the canvas, a press there selects and drags the element; in Page it acts
 * as a block-selection anchor. Widgets mark them with `data-rivto-drag-handle`.
 */
export interface HtmlEditorPointerRegion {
  /** Left edge, as a fraction of the iframe viewport width (0 to 1). */
  readonly x: number;
  /** Top edge, as a fraction of the iframe viewport height (0 to 1). */
  readonly y: number;
  /** Width, as a fraction of the iframe viewport width. */
  readonly width: number;
  /** Height, as a fraction of the iframe viewport height. */
  readonly height: number;
}

/**
 * Determines how the editor sizes an HTML widget iframe.
 *
 * - `auto` is used for Page blocks. The iframe takes the available width, and
 *   the editor sizes its height from the content height reported by the widget.
 *   The height is capped at `maxBlockHeight` (720 CSS pixels by default).
 *   Taller content can scroll inside the iframe.
 * - `fill` is used for canvas elements. The iframe fills the width and height
 *   of the element's frame. The editor ignores reported content heights in
 *   this mode.
 */
export type HtmlFrameFit = "auto" | "fill";

/** What a widget in a Page block sees as `rivto.node`. */
export interface HtmlBlockView {
  /** Always `"block"`. */
  readonly kind: "block";
  /** ID of the block. */
  readonly id: string;
  /** Block type: `"html"` or `"unsafe-html"`. */
  readonly type: string;
  /** The widget's own HTML source. */
  readonly content: string;
  /** Widget props; the widget writes them with `rivto.setProp` / `rivto.setProps`. */
  readonly props: Record<string, unknown>;
  /** List props of the block; written with `rivto.setListProps`. */
  readonly listProps: Record<string, unknown>;
  /** Data other extensions attached to the block. Read-only for the widget. */
  readonly pluginData: Record<string, unknown>;
  /** IDs of the block's children. */
  readonly childIds: readonly string[];
  /** Presentation of this block occurrence. */
  readonly context: HtmlWidgetContext;
}

/** What a widget in a canvas element sees as `rivto.node`. */
export interface HtmlElementView {
  /** Always `"element"`. */
  readonly kind: "element";
  /** ID of the element. */
  readonly id: string;
  /** Element type: `"html"`. */
  readonly type: string;
  /** Position and size on the canvas, in canvas units. */
  readonly frame: { x: number; y: number; width: number; height: number };
  /** Stacking order on the canvas. */
  readonly zIndex: number;
  /** Element props. `props.html` is the widget's own HTML source. */
  readonly props: Record<string, unknown>;
  /** IDs of the element's children. */
  readonly childIds: readonly string[];
  /** Presentation of this element occurrence. */
  readonly context: HtmlWidgetContext;
}

/** The snapshot a widget sees as `rivto.node`. */
export type HtmlNodeView = HtmlBlockView | HtmlElementView;

/** A snapshot without its context. The frame adds the current context when posting it. */
export type HtmlNodeData = Omit<HtmlBlockView, "context"> | Omit<HtmlElementView, "context">;

/**
 * A command a widget sends to its block or element.
 *
 * - `pointerdown`: the user pressed inside the widget; `primary` is true when
 *   Ctrl or Cmd was held. Used to select canvas elements.
 * - `set-prop` / `set-props`: merge props (`rivto.setProp` / `rivto.setProps`).
 * - `set-list-props`: merge block list props (`rivto.setListProps`).
 * - `set-content`: replace the HTML source (`rivto.setContent`).
 */
export type HtmlWidgetCommand =
  | { readonly kind: "pointerdown"; readonly primary: boolean }
  | { readonly kind: "set-prop"; readonly key: string; readonly value: unknown }
  | { readonly kind: "set-props"; readonly props: Record<string, unknown> }
  | { readonly kind: "set-list-props"; readonly listProps: Record<string, unknown> }
  | { readonly kind: "set-content"; readonly content: string };

/**
 * Describes the edits submitted when the user presses Done in the HTML source editor.
 *
 * The form compares the submitted HTML and widget props with the values shown
 * when it opened. Save handlers apply only the fields edited during the session
 * to the current node. For example, changing only `label` updates that prop while
 * preserving the current HTML and any other props changed while the form was open.
 * When the user edits the HTML, a block stores it in `content` and a canvas element
 * stores it in `props.html`.
 */
export interface HtmlDraft {
  /** HTML captured when the editor opened, used as the baseline for detecting a source edit. */
  readonly openingSource: string;
  /** Full HTML text at submission. The save handler writes it when it differs from `openingSource`. */
  readonly source: string;
  /**
   * Top-level widget props the user added, changed or removed during this session.
   * A removed prop has the value `undefined` so the manager deletes it. An omitted
   * key leaves its current value intact. Editing a nested value replaces the value
   * of its top-level key as a whole.
   */
  readonly propsPatch: Record<string, unknown>;
}

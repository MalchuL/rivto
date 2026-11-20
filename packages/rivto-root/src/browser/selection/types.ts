/**
 * One saved caret endpoint.
 *
 * - `{ textOffset }` — was inside `root`; character index into `root`'s plain
 *   text. Survives Text-node replacement.
 * - `{ node, offset }` — was outside `root`; live DOM Node + offset, same
 *   shape as `Selection` / `setBaseAndExtent` (Node is often Text).
 *
 * A single representation cannot safely cover both locations:
 *
 * - Always storing `{ node, offset }` would retain a pointer to an internal
 *   Text node that becomes detached when `root.textContent` is replaced.
 * - Always storing a text offset would lose which external block or DOM node
 *   owns the other endpoint of a cross-block selection.
 *
 * One object with optional `node` and `textOffset` fields would still contain
 * these same two states, but would also permit invalid combinations. The union
 * makes TypeScript require callers to handle exactly one valid case.
 */
export type SavedPoint =
  { readonly textOffset: number } | { readonly node: Node; readonly offset: number };

/**
 * Anchor and focus points for a directed browser selection.
 *
 * Both ends are saved independently so collapsed carets and bottom→top
 * selections keep their direction (unlike a normalized Range).
 */
export interface SavedDOMSelection {
  /** Original anchor endpoint. */
  readonly anchor: SavedPoint;
  /** Original focus endpoint. */
  readonly focus: SavedPoint;
}
/**
 * One live browser caret or selection endpoint inside editable content.
 *
 * Cross-host drags retain two of these for `Selection.setBaseAndExtent`.
 * The node is usually a Text node, but can be the content element when empty.
 * The host identifies the document and the content owning that endpoint.
 */
export interface BrowserTextSelectionPoint {
  /** Live native node held only during the originating gesture or restoration. */
  readonly node: Node;
  /** Character offset for a Text node or child index for an Element. */
  readonly offset: number;
  /** Owning editable host used to focus and access the selection document. */
  readonly content: HTMLElement;
}

/** Browser document exposing WebKit's fallback caret hit test. */
export interface BrowserCaretDocument extends Document {
  /**
   * Resolves a native range at viewport coordinates when the browser supports it.
   *
   * @param left - Horizontal viewport coordinate in CSS pixels.
   * @param top - Vertical viewport coordinate in CSS pixels.
   * @returns Browser range, or null when no caret can be resolved.
   */
  caretRangeFromPoint(left: number, top: number): Range | null;
}

/** Measured caret position on a rendered visual line. */
export interface BrowserCaretCandidate {
  /** UTF-16 offset within the content host. */
  readonly offset: number;
  /** Horizontal viewport coordinate in CSS pixels. */
  readonly left: number;
  /** Vertical viewport coordinate in CSS pixels. */
  readonly top: number;
}

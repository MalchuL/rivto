/** Public structural class names; concrete block renderer classes remain host-owned. */
export const BLOCK_EDITOR_CLASSES = Object.freeze({
  /** Outer block container, including its row, body slots, and children. */
  block: "rivto-block",
  /** Main row containing content and its inline/perimeter slots. */
  row: "rivto-block-row",
  /** Flexible container for the host's concrete content renderer. */
  content: "rivto-block-content",
  /** Child host with its own list counter and collapse visibility; indentation belongs to its layout. */
  children: "rivto-block-children",
  /** DOM-free gap boundary used by sibling counter selectors; excluded from placement adjacency. */
  listGap: "rivto-block-list-gap",
  /** Contribution host positioned by its data-slot-position attribute. */
  slot: "rivto-block-slot",
  /** Bounded inert content row inside a gesture-owned preview. */
  dragPreviewRow: "rivto-block-drag-preview-row",
  /** Pointer-transparent line showing a permitted canonical insertion boundary. */
  dropLine: "rivto-block-drop-line",
  /** Stable root-list host shared by full and windowed rendering. */
  tree: "rivto-virtual-tree",
  /** Measured placement of one displayed root subtree. */
  virtualRoot: "rivto-virtual-root",
  /** Numeric list marker rendered through the sibling group's CSS counter. */
  marker: "rivto-block-list-marker",
});

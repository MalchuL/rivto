/** Layout direction used to compare child positions during dragging: rows, columns, or a grid. */
export type DropAxis = "vertical" | "horizontal" | "grid";

/** Optional drag-placement tuning supplied by a block registration. */
export interface BlockDropPlacementOptions {
  /** Whether the block may receive a drop as a new child. Defaults to `true`. */
  readonly allowChildPlacement?: boolean;
  /** Horizontal pixels representing one requested child depth. */
  readonly childDropIndent?: number;
  /** Pixels at an item's edges reserved for sibling placement. */
  readonly gapDropZone?: number;
}

/** Optional page-drag geometry; registering these options does not enable dragging. */
export interface BlockDragOptions {
  /** Layout direction of direct children; omitted uses ordinary outline placement. */
  readonly dropAxis?: DropAxis;
  /** Overrides for the shared placement defaults. */
  readonly dropPlacement?: BlockDropPlacementOptions;
  /** Whether the entire block body receives drops, including empty lanes. Defaults to false. */
  readonly acceptsDropContainer?: boolean;
  /** Whether hovering anywhere in the container reveals its handle. Defaults to false. */
  readonly showHandleOnContainerHover?: boolean;
}

/** Extension identifier used as the metadata namespace for optional page-drag geometry. */
export const PAGE_DRAG_METADATA_KEY = "drag.page";

/** Layout direction used to compare child positions during dragging: rows, columns, or a grid. */
export type DropAxis = "vertical" | "horizontal" | "grid";

/** Optional drag-placement tuning supplied by a block registration. */
export interface BlockDropPlacementOptions {
  /** Whether the block may receive a drop as a new child. Defaults to `true`. */
  readonly allowChildPlacement?: boolean;
}

/** Optional page-drag geometry; registering these options does not enable dragging. */
export interface BlockDragOptions {
  /** Layout direction of direct children; omitted uses ordinary outline placement. */
  readonly dropAxis?: DropAxis;
  /** Overrides for the shared placement defaults. */
  readonly dropPlacement?: BlockDropPlacementOptions;
  /** Whether the entire block body receives drops, including empty lanes. Defaults to false. */
  readonly acceptsDropContainer?: boolean;
  /**
   * Uses fixed structural sorting and outline boundaries for drag placement.
   *
   * Defaults to false. Layout owners such as Columns, Kanban, Bento, tables and
   * table rows enable this to distinguish their geometry from ordinary outline
   * blocks. The flag affects both this block's target regions and its child layout:
   *
   * - This block's row offers sibling insertion using its upper/lower halves.
   *   Receiving children through the body remains controlled by acceptsDropContainer.
   * - In vertical/horizontal child lists, a source that cannot enter the hovered
   *   child can still target a sibling gap using halves along the layout axis.
   *   For example, dragging a column over another column's interior offers
   *   reordering beside it instead of losing the target to a rejected inside drop.
   * - Horizontal pointer movement cannot project an outline gap across this
   *   child-layout boundary. Fixed blocks also stop traversal into descendants
   *   when projecting a preceding outline branch's insertion depth.
   * - Narrow outer edges remain candidate regions for moving this block among
   *   siblings, and its full bounds are retained when moved children are excluded
   *   from the destination tree.
   *
   * With dropAxis configured, direct children use their full block element for
   * drop feedback and keyboard target geometry. Their committed sibling moves
   * are eligible for animation, respecting reduced-motion preferences.
   *
   * These rules propose destinations; canMove still decides whether each proposed
   * move is permitted. Keyboard indent/outdent restrictions are independently
   * implemented by onChildIndent/onChildOutdent. Omitting this flag enables ordinary
   * outline target selection and disables the wrapper's child-sorting animations,
   * while dropAxis still determines the placement resolver's child-list direction.
   */
  readonly fixed?: boolean;
}

/**
 * Reads placement annotations owned by the optional page drag extension.
 *
 * Parameters do not install dragging; omitted annotations use provider defaults.
 *
 * @param metadata - Opaque runtime annotations of a registered native type.
 * @returns Drag parameters, or undefined when drag.page is not configured.
 */
export function getBlockDragOptions(
  metadata: Readonly<Record<string, unknown>> | undefined,
): BlockDragOptions | undefined {
  return metadata?.[PAGE_DRAG_METADATA_KEY] as BlockDragOptions | undefined;
}

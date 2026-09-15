/**
 * Public values that describe Rivto's local selection domain.
 *
 * A selection is plain runtime data, not a document entity and not a behavior
 * object. SelectionManager owns validation, cloning, equality, and mutation;
 * browser adapters only translate native DOM endpoints into these values.
 */

/**
 * One concrete caret boundary inside a block's current text.
 *
 * The position points between UTF-16 code units rather than at a character.
 * This matches JavaScript string indices and browser DOM Range offsets. For a
 * block containing `content`, valid offsets are integers from `0` through
 * `content.length`: `0` is before the first code unit and `content.length` is
 * after the last one. A Unicode symbol may occupy two UTF-16 code units.
 *
 * `-1` is not a valid EditorPosition offset. The live-end `-1` sentinel belongs
 * only to {@link BlockRange.end}. EditorPosition always records the concrete
 * boundary observed when a caret or gesture endpoint is captured.
 */
export interface EditorPosition {
  /** Stable ID of the block containing the position. */
  blockId: string;
  /**
   * Concrete zero-based UTF-16 boundary in the block's current content.
   * Expected range: `0 <= offset <= content.length`; `-1` is never a sentinel here.
   */
  offset: number;
}

/**
 * Content coverage for one selected block.
 *
 * Both offsets are measured from the start of the block. `start` is inclusive;
 * `end` is exclusive. The sole sentinel, `end: -1`, means the block's current
 * end. Consequently `{ start: 0, end: -1 }` represents a whole block and still
 * works when its content changes after selection.
 */
export interface BlockRange {
  /** Stable ID of the covered block. */
  id: string;
  /** Inclusive UTF-16 offset from the start of the block. */
  start: number;
  /** Exclusive UTF-16 offset from the start of the block, or `-1` for the current end of the block. */
  end: number;
}

/**
 * The editor's single generic selection value.
 *
 * Blocks, canvas elements, and plugin-owned data deliberately share one value
 * so mixed edgeless gestures do not require parallel selection stores. Block
 * endpoint IDs are required only when `blocks` is non-empty. The value remains
 * local runtime state and is never persisted or synchronized through the CRDT.
 */
export interface Selection {
  /** Stable discriminator used at command and extension boundaries. */
  readonly type: "selection";
  /** Block coverage in current visible document order. */
  readonly blocks: BlockRange[];
  /** Block where a directed block gesture began. */
  readonly anchorBlockId?: string;
  /** Block at the active end of a directed block gesture. */
  readonly focusBlockId?: string;
  /** Whether a same-block text gesture runs from a later offset to an earlier one. */
  readonly reversed?: boolean;
  /** Stable IDs of selected first-class canvas elements. */
  readonly elements?: string[];
  /** Extension-owned, non-persisted selection namespaces. */
  readonly pluginData?: Record<string, unknown>;
}

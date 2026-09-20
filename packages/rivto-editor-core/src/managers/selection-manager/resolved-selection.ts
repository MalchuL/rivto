/**
 * Document-backed selection ranges used internally by editing operations.
 *
 * Public Selection values intentionally keep lightweight IDs and offsets.
 * SelectionManager resolves them against the current document before copy,
 * delete, or paste so consumers share one definition of invalid ranges.
 */
import type { Block } from "@chulane/document-model";
import type { EditorPosition } from "./selection";

/** One block range paired with the live block it currently addresses. */
export interface ResolvedBlockRange {
  /** Detached current block value. */
  block: Block;
  /** Inclusive UTF-16 start used by text operations. */
  startOffset: number;
  /** Exclusive UTF-16 end used by text operations. */
  endOffset: number;
  /** Whether invalid source offsets were converted to an empty range. */
  invalid: boolean;
}

/**
 * A block-bearing Selection with live offsets.
 *
 * Member order follows the stored `blocks` array. After `set()`, that array is
 * in document order, so `start`/`end` are the earlier and later boundaries
 * regardless of gesture direction.
 */
export interface ResolvedSelection {
  /** Start of the first resolved member. */
  start: EditorPosition;
  /** End of the last resolved member. */
  end: EditorPosition;
  /** Detached selected blocks in stored member order. */
  blocks: Block[];
  /** Resolved text coverage for every selected block. */
  ranges: ResolvedBlockRange[];
  /**
   * Whether the selection originated from text/caret rather than structural selection.
   *
   * Derived from `!isStructuralSelection(selection)`. Returned by copy() operations
   * to guide paste strategies: text selections enable text-merge paste, structural
   * selections insert as complete block subtrees.
   */
  fromTextSelection: boolean;
}

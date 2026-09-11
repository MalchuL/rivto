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
   * Whether this is a text-range selection rather than a wholly structural one.
   *
   * True unless every stored member is `{ start: 0, end: -1 }`. Carets, partial
   * blocks, and multi-block text ranges all count. Interior text members use
   * concrete lengths, not the live-end sentinel.
   *
   * Example — blocks "The fox", "jumps over", "the lazy dog"; anchor in "fox",
   * head in "dog":
   * - `{ id: "the_fox", start: 4, end: 8 }`
   * - `{ id: "jumps_over", start: 0, end: 11 }`
   * - `{ id: "the_lazy_dog", start: 0, end: 8 }`
   */
  startsWithText: boolean;
}

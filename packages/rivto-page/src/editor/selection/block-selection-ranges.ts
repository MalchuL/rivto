import type {
  BlockSelectionRange as BlockRange,
  BlockSelectionPosition as EditorPosition,
  BlockSelectionSnapshot as Selection,
} from "./types";
/** Live offsets after resolving stored coverage against current text length. */
interface ResolvedBlockRange {
  readonly startOffset: number;
  readonly endOffset: number;
  readonly invalid: boolean;
}
/** Visible block identity with its host-owned UTF-16 text length. */
interface SelectionTextBlock {
  readonly id: string;
  readonly length: number;
}
/** Constructs portable selection ranges without document-model dependencies. */
export class BlockSelectionRanges {
  /**
   * Creates one structural selection covering the given IDs.
   * @param ids - Selected IDs already in visible document order.
   * @param anchorBlockId - Gesture start; defaults to the first ID.
   * @param focusBlockId - Gesture head; defaults to the last ID.
   * @returns Whole-block selection using the live-end sentinel.
   */
  static createStructuralSelection(
    ids: readonly string[],
    anchorBlockId = ids[0] ?? "",
    focusBlockId = ids.at(-1) ?? "",
  ): Selection {
    return {
      type: "selection",
      blocks: ids.map((id) => ({ id, start: 0, end: -1 })),
      anchorBlockId,
      focusBlockId,
    };
  }
  /**
   * Resolves per-block offsets against a live content length.
   *
   * Apart from the `end: -1` live-end sentinel, invalid markers become an empty
   * slice so copy/delete/paste still run instead of throwing.
   *
   * @param length - Current UTF-16 length of the block.
   * @param start - Stored offset from the start.
   * @param end - Stored exclusive offset from the start, or `-1` for live end.
   * @returns Inclusive/exclusive UTF-16 range against that length.
   */
  static resolveBlockRange(length: number, start: number, end: number): ResolvedBlockRange {
    const endOffset = end === -1 ? length : end;
    const invalid =
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end < -1 ||
      endOffset < start ||
      endOffset > length;
    if (invalid) {
      // Invalid markers become an empty slice at a clamped caret, not a throw.
      const caret = Number.isFinite(start) ? Math.min(Math.max(0, start), Math.max(0, length)) : 0;
      return { startOffset: caret, endOffset: caret, invalid: true };
    }
    return { startOffset: start, endOffset, invalid: false };
  }
  /**
   * Returns whether every block member covers its complete live content.
   * @param selection - Local selection to classify.
   * @returns Whether structural copy/delete/paste should run.
   */
  static isStructuralSelection(selection: Selection | undefined): boolean {
    return Boolean(
      selection?.blocks.length &&
      selection.blocks.every((block) => block.start === 0 && block.end === -1),
    );
  }
  /**
   * Builds a block selection from two directed UTF-16 endpoints.
   *
   * Example:
   * Blocks:
   * - The fox
   * - jumps over
   * - the lazy dog
   * If the anchor is the "fox" and the head is the "dog", the selection will be:
   * - { id: "the_fox", start: 4, end: 8 }  // Latest 3 characters of the "fox" block
   * - { id: "jumps_over", start: 0, end: 11 }  // Whole line of the "jumps over" block
   * - { id: "the_lazy_dog", start: 0, end: 8 }  // First 8 characters of the "lazy dog" block
   *
   * `ordered` defines both membership and canonical storage order. The returned
   * `blocks` array always runs from the earlier visible block to the later one,
   * even when the user dragged upward. Gesture direction is preserved separately
   * by `anchorBlockId` and `focusBlockId`; for a reverse gesture inside one block,
   * `reversed` records which same-block endpoint was the anchor.
   *
   * A same-block selection stores the smaller offset as `start` and the larger as
   * `end`. Across blocks, the first range starts at its endpoint and extends to
   * that block's supplied length, intermediate blocks cover all current text,
   * and the last range runs from zero to its endpoint. These are text ranges, so
   * complete intermediate blocks use their concrete lengths rather than the
   * structural `end: -1` sentinel.
   *
   * The mapper's `index` belongs to `ordered.slice(lo, hi + 1)`, not to the full
   * document. Therefore `index === 0` means the earlier boundary block of this
   * selection, and `index === slice.length - 1` means its later boundary block.
   * “Earlier” and “later” refer to document order, not gesture direction: a
   * bottom-to-top drag produces the same range order as a top-to-bottom drag.
   *
   * This constructor deliberately does not clamp or reject endpoint offsets.
   * SelectionManager resolves them against live content later, converting an
   * invalid range to an empty slice without losing the rest of the selection.
   *
   * @param ordered - Visible block IDs and current UTF-16 lengths in canonical document order.
   * @param anchor - Fixed gesture origin expressed as a block ID and UTF-16 offset.
   * @param head - Moving gesture endpoint expressed as a block ID and UTF-16 offset.
   * @returns One selection covering the inclusive block interval, or `undefined` when either block is absent from `ordered`.
   */
  static createTextSelection(
    ordered: readonly SelectionTextBlock[],
    anchor: EditorPosition,
    head: EditorPosition,
  ): Selection | undefined {
    const anchorIndex = ordered.findIndex((block) => block.id === anchor.blockId);
    const headIndex = ordered.findIndex((block) => block.id === head.blockId);
    if (anchorIndex < 0 || headIndex < 0) {
      return undefined;
    }
    // Find the lower and higher index of the ordered blocks.
    const lo = Math.min(anchorIndex, headIndex);
    const hi = Math.max(anchorIndex, headIndex);
    // Find the start and stop positions of the selection.
    // If the lower index is the anchor index, the start is the anchor, otherwise it is the head.
    const start = lo === anchorIndex ? anchor : head;
    const stop = hi === anchorIndex ? anchor : head;
    const blocks = ordered.slice(lo, hi + 1).map((block, index, slice): BlockRange => {
      // With only one selected block, it is both boundaries. Sorting the two
      // offsets gives the stored [start, end) range while `reversed` below keeps
      // the original gesture direction.
      if (slice.length === 1) {
        const from = Math.min(anchor.offset, head.offset);
        const to = Math.max(anchor.offset, head.offset);
        return { id: block.id, start: from, end: to };
      }
      /* 
    If the selection is multi-block, we need to create a block range for each block in the selection.
    Example:
    Blocks:
    - The fox
    - jumps over
    - the lazy dog
    If the anchor is the "fox" and the head is the "dog", the selection will be:
    - { id: "the_fox", start: 4, end: 8 }
    - { id: "jumps_over", start: 0, end: 11 }
    - { id: "the_lazy_dog", start: 0, end: 8 }
    And this must be independent top down or bottom up selection.
    */
      // Index zero is the first block of the selected slice, which may be any
      // block in the document. Its range begins at the earlier boundary offset
      // and covers the remainder of that block.
      if (index === 0) {
        return { id: block.id, start: start.offset, end: block.length };
      }
      // The last slice index is the later boundary block, not necessarily the
      // document's last block. Its range covers text from zero to that endpoint.
      if (index === slice.length - 1) {
        return { id: block.id, start: 0, end: stop.offset };
      }
      // Full text coverage is still part of one text range; the selection as a
      // whole remains non-structural when either boundary is partial.
      return { id: block.id, start: 0, end: block.length };
    });
    return {
      type: "selection",
      blocks,
      anchorBlockId: anchor.blockId,
      focusBlockId: head.blockId,
      reversed: anchorIndex === headIndex && head.offset < anchor.offset,
    };
  }
}

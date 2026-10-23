/**
 * Reconstructs directional selection endpoints for React interaction code.
 *
 * Core stores selected block ranges in document order so clipboard and
 * mutation logic can process them predictably. Browser-facing code instead
 * needs the original anchor and moving head to restore a native selection,
 * place pasted content, and navigate from the correct edge. This module is
 * the adapter between those two representations; it does not own selection
 * state or mutate the document.
 */
import { BlockSelectionRanges } from "./block-selection-ranges";
import type {
  BlockSelectionPosition as EditorPosition,
  BlockSelectionSnapshot as Selection,
} from "./types";

/** Directed concrete endpoints recovered from stored coverage. */
interface BlockSelectionEndpointPair {
  readonly anchor: EditorPosition;
  readonly head: EditorPosition;
}

/**
 * Recovers directed UTF-16 endpoints from document-ordered block ranges.
 *
 * The first range's start and last range's end describe the two physical
 * edges. `anchorBlockId`, `focusBlockId`, and same-block `reversed` metadata
 * then restore which edge began the gesture. Resolving each edge against its
 * current block length also expands `end: -1` and safely collapses malformed
 * offsets when content changed after the selection was captured.
 *
 * @param selection - Stored selection whose block ranges use document order.
 * @param lengthOf - Returns the current UTF-16 content length for a block ID.
 * @returns Directed anchor and head positions, or `undefined` without blocks.
 */
export class BlockSelectionEndpoints {
  /**
   * Restores directed endpoints from canonical ranges using current text lengths.
   *
   * @param selection - Detached coverage in canonical order.
   * @param lengthOf - Current UTF-16 length for each endpoint block.
   * @returns Directed endpoints, or undefined without block coverage.
   */
  static resolve(
    selection: Selection,
    lengthOf: (id: string) => number,
  ): BlockSelectionEndpointPair | undefined {
    const first = selection.blocks[0];
    const last = selection.blocks.at(-1);
    if (!first || !last) {
      return undefined;
    }
    const fromStart = BlockSelectionRanges.resolveBlockRange(
      lengthOf(first.id),
      first.start,
      first.end,
    );
    const toEnd = BlockSelectionRanges.resolveBlockRange(lengthOf(last.id), last.start, last.end);
    const startPos = { blockId: first.id, offset: fromStart.startOffset };
    const endPos = { blockId: last.id, offset: toEnd.endOffset };
    // Block order cannot express a bottom-up gesture, so recover direction from
    // endpoint IDs. Same-block ranges need their explicit reversal marker.
    const reverse =
      selection.blocks.length === 1
        ? selection.reversed === true
        : selection.blocks.findIndex((block) => block.id === selection.anchorBlockId) >
          selection.blocks.findIndex((block) => block.id === selection.focusBlockId);
    return reverse ? { anchor: endPos, head: startPos } : { anchor: startPos, head: endPos };
  }
}

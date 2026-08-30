import type { EditorPosition } from "../../editor/types";
import type { Block } from "../../store/document-model";

/** A directed editor selection normalized into document order. */
export interface NormalizedSelection {
  /** Earlier block and UTF-16 offset, regardless of gesture direction. */
  start: EditorPosition;
  /** Later block and UTF-16 offset. */
  end: EditorPosition;
  /**
   * Detached blocks in depth-first document order.
   * For block-only selection: only selected IDs (gaps stay).
   * For text or mixed selection: all blocks from start to end inclusive.
   */
  blocks: Block[];
  /**
   * Whether the earliest document-order boundary came from a text item.
   *
   * Clipboard paste uses this instead of the raw selection array order so a
   * mixed selection still merges text when the earliest boundary is text.
   */
  startsWithText: boolean;
}

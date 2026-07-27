import type { EditorPosition } from "../../editor/types";
import type { Block } from "../../store/document-model";

/** A directed editor selection normalized into document order. */
export interface NormalizedSelection {
  /** Earlier block and UTF-16 offset, regardless of gesture direction. */
  start: EditorPosition;
  /** Later block and UTF-16 offset. */
  end: EditorPosition;
  /** Detached blocks touched by the range in depth-first document order. */
  blocks: Block[];
}

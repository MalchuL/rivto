/** Whole-block selection resolved against the canonical document forest. */
import type { Block } from "@chulane/document-model";

/** Selected blocks in document order; gaps remain unselected. */
export interface NormalizedSelection {
  /** Detached blocks explicitly included in the selection. */
  blocks: Block[];
}

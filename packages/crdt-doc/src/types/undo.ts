import type { CRDTArray } from "./array";
import type { CRDTMap } from "./map";
import type { CRDTText } from "./text";

export type CRDTUndoScope = CRDTArray<any> | CRDTMap<any> | CRDTText;

export interface CRDTUndoManager {
  /**
   * Reverts the most recent tracked change when an undo entry is available.
   */
  undo(): void;
  /**
   * Reapplies the most recently undone tracked change when a redo entry is available.
   */
  redo(): void;
  /**
   * Clears the undo and redo histories.
   */
  clear(): void;
  /**
   * Ends the current capture group so subsequent tracked changes form a separate undo entry.
   */
  stopCapturing(): void;
  /**
   * Releases the undo manager and its subscriptions.
   */
  destroy(): void;
}

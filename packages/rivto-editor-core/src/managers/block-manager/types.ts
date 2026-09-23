/**
 * Shared contract for recovering one block that fails editor creation
 * preparation. Recovery is optional, synchronous, and retried exactly once.
 */
import type { EditorBlockInput } from "../../editor/model";

/** Replaces one block whose definition, policy, or processor rejected it. */
export interface BlockPrepareErrorHandler {
  /**
   * @param block - Exact detached node that failed preparation.
   * @param error - Failure raised while preparing that node.
   * @returns Replacement input to prepare once without further recovery.
   */
  (block: EditorBlockInput, error: unknown): EditorBlockInput;
}

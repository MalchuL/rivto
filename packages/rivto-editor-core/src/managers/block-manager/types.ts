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

/** Identity requirements for importing a complete block forest. */
export interface BlockImportOptions {
  /** Optional replacement when preparing a block fails. */
  readonly onError?: BlockPrepareErrorHandler;
  /** Source-to-destination IDs allocated before the import. */
  readonly ids?: ReadonlyMap<string, string>;
  /**
   * Preserve every source ID and reject missing or conflicting IDs before insertion.
   * Preparation must leave the original identity set unchanged, including when an
   * explicit ID mapping is supplied. Defaults to false, allowing remapping.
   */
  readonly preserveIds?: boolean;
}

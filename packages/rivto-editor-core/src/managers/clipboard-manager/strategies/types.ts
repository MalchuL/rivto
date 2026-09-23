/**
 * Shared contracts for clipboard paste strategy matching, placement, results,
 * and live text targets.
 */
import type { Block } from "@chulane/document-model";
import type { Selection } from "../../selection-manager";
import type { BlockPastePlacement, ClipboardBundle } from "../clipboard-data";
import type { BlockPrepareErrorHandler } from "../../block-manager/types";

/** Shared clipboard payload supplied to every strategy. */
export interface PasteContext {
  /** Valid structured clipboard, when present. */
  readonly bundle?: ClipboardBundle;
  /** Plain-text fallback used when no structured merge applies. */
  readonly text?: string;
  /** Block type for additional lines created from plain text. */
  readonly defaultBlockType?: string;
  /** Selection observed when paste started. */
  readonly selection?: Selection;
  /** Optional one-shot replacement for a block rejected during import preparation. */
  readonly onPrepareError?: BlockPrepareErrorHandler;
  /** Block identities produced by an earlier strategy in this paste pipeline. */
  readonly blockIdMap?: ReadonlyMap<string, string>;
  /** Element identities produced by an earlier strategy in this paste pipeline. */
  readonly elementIdMap?: ReadonlyMap<string, string>;
}

/** Destination for inserted content, independent from clipboard payload. */
export type PastePlacement = BlockPastePlacement;

/** Selection and identity mappings proposed after a strategy writes. */
export interface PasteResult {
  /** Complete local selection the clipboard manager should publish. */
  readonly proposedSelection: Selection;
  /** Block identities made available to later paste strategies. */
  readonly blockIdMap?: ReadonlyMap<string, string>;
  /** Element identities made available to later paste strategies. */
  readonly elementIdMap?: ReadonlyMap<string, string>;
}

/** Valid text replacement range in document order. */
export interface TextPasteTarget {
  /** Selected blocks from first boundary to last boundary. */
  readonly blocks: Block[];
  /** UTF-16 offset in the first block. */
  readonly startOffset: number;
  /** UTF-16 offset in the last block. */
  readonly endOffset: number;
}

/** Clipboard paste algorithm that accepts or ignores a shared context. */
export interface PasteStrategy {
  /**
   * Reports whether this algorithm should run for the clipboard and destination.
   * @param context - Shared clipboard payload.
   * @param placement - Host or derived insertion destination.
   * @returns Whether {@link paste} should run.
   */
  matches(context: PasteContext, placement: PastePlacement): boolean;

  /**
   * Applies this strategy's insertion path.
   * @param context - Shared clipboard payload.
   * @param placement - Host or derived insertion destination.
   * @returns Proposed selection after a successful mutation.
   */
  paste(context: PasteContext, placement: PastePlacement): PasteResult | undefined;
}

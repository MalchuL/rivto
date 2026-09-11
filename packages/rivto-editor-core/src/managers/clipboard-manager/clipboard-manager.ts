/**
 * Copies normalized block ranges and dispatches paste to registered strategies
 * inside one transaction.
 */
import type { EditorRuntime } from "../../editor/rivto-editor";
import {
  isCaretSelection,
  isStructuralSelection,
  type EditorPosition,
  type Selection,
} from "../selection-manager";
import type { ClipboardBundle, ClipboardPasteInput } from "./clipboard-data";
import {
  BLOCK_PASTE_STRATEGY_ID,
  PRESERVE_NEWLINES_PASTE_STRATEGY_ID,
  TEXT_PASTE_STRATEGY_ID,
} from "./constants";
import { cloneSelectedTopLevelSubtrees, findBlock, validateClipboardBundle } from "./utils";
import {
  BlockPasteStrategy,
  PreserveNewlinesPasteStrategy,
  TextPasteStrategy,
  type PasteContext,
  type PastePlacement,
} from "./strategies";
import { PasteStrategyRegistry } from "./strategies";

/** Framework-neutral clipboard operations over blocks with per-block offsets. */
export class ClipboardManager {
  /** Paste algorithms constructed once for this editor and consulted by id. */
  readonly pasteStrategies = new PasteStrategyRegistry();

  /**
   * Creates the clipboard owner and registers core paste strategies.
   * @param editor - Runtime providing document operations and history.
   */
  constructor(private readonly editor: EditorRuntime) {
    this.pasteStrategies.register(
      PRESERVE_NEWLINES_PASTE_STRATEGY_ID,
      new PreserveNewlinesPasteStrategy(editor),
    );
    this.pasteStrategies.register(TEXT_PASTE_STRATEGY_ID, new TextPasteStrategy(editor));
    this.pasteStrategies.register(BLOCK_PASTE_STRATEGY_ID, new BlockPasteStrategy(editor));
  }

  /**
   * Copies selected subtrees without filling gaps or changing their identities.
   * @param selection - Optional block selection override.
   * @returns Detached portable data, or undefined without selected blocks.
   */
  copy(selection?: Selection): ClipboardBundle | undefined {
    const current = selection ?? this.editor.selection.get();
    const range = this.editor.selection.resolveBlockSelection(current);
    if (!range) return undefined;
    const structural = isStructuralSelection(current);
    if (!structural && range.ranges.length === 1) {
      const only = range.ranges[0]!;
      if (!only.invalid && only.startOffset === only.endOffset) return undefined;
    }
    const blocks = cloneSelectedTopLevelSubtrees(this.editor.blocks.getBlocks(), range, structural);
    if (!structural) {
      range.ranges.forEach(({ block, invalid, startOffset, endOffset }) => {
        const copy = findBlock(blocks, block.id);
        if (!copy) return;
        copy.content = invalid ? "" : block.content.slice(startOffset, endOffset);
      });
    }
    return { version: 4, startsWithText: range.startsWithText || undefined, blocks };
  }

  /**
   * Copies characters covered by an explicit selection, excluding collapsed carets.
   * @param selection - One block selection to copy.
   * @returns Partial-text bundle, or undefined for a caret.
   */
  copyText(selection: Selection): ClipboardBundle | undefined {
    return this.copy(selection);
  }

  /**
   * Copies and removes selected block subtrees as one undoable action.
   * @returns Copied forest, or undefined without selected blocks.
   */
  cut(): ClipboardBundle | undefined {
    const bundle = this.copy();
    if (bundle) this.editor.selection.delete();
    return bundle;
  }

  /**
   * Pastes structured blocks or plain text using the current or supplied range.
   * Matching strategies run in registration order. Overlapping offsets delete
   * as an empty slice.
   * The manager publishes the complete proposed selection, but still returns a
   * concrete caret for command and host adapters that position a native cursor
   * without interpreting Rivto's generic selection shape.
   * @param input - Clipboard flavors, placement and optional editing range.
   * @returns Resulting text caret, or undefined for structural/no-op paste.
   */
  paste(input: ClipboardPasteInput = {}): EditorPosition | undefined {
    let context = this.createPasteContext(input);
    const placement: PastePlacement = input.placement ?? {};
    let caret: EditorPosition | undefined;
    this.editor.batchUpdates(() => {
      this.pasteStrategies.getPasteStrategies().forEach((strategy) => {
        if (!strategy.matches(context, placement)) return;
        const result = strategy.paste(context, placement);
        if (!result) return;
        context = {
          ...context,
          blockIdMap: result.blockIdMap ?? context.blockIdMap,
          elementIdMap: result.elementIdMap ?? context.elementIdMap,
        };
        this.editor.selection.set(result.proposedSelection);
        const selected = result.proposedSelection.blocks[0];
        // Preserve the established paste return contract while selection state
        // itself comes exclusively from the strategy's proposal.
        caret = isCaretSelection(result.proposedSelection) && selected
          ? { blockId: selected.id, offset: selected.start }
          : undefined;
      });
    });
    return caret;
  }

  /**
   * Builds the shared strategy context from a host paste request.
   * @param input - Clipboard flavors and optional editing range.
   * @returns Context with a validated bundle and the paste-time selection.
   */
  private createPasteContext(input: ClipboardPasteInput): PasteContext {
    let bundle: ClipboardBundle | undefined;
    try {
      const candidate = input.bundle ?? (input.structured ? JSON.parse(input.structured) as unknown : undefined);
      if (candidate !== undefined) {
        validateClipboardBundle(candidate);
        bundle = candidate;
      }
    } catch {
      bundle = undefined;
    }
    return {
      bundle,
      text: input.text,
      defaultBlockType: input.defaultBlockType,
      selection: input.textTarget ?? this.editor.selection.get(),
    };
  }
}

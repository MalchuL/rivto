/**
 * Clipboard paste algorithms consulted by ClipboardManager.
 *
 * All flavors share {@link PasteContext}. Placement is a separate destination
 * object. Each strategy decides whether it applies via {@link PasteStrategy.matches}
 * and owns insertion for that case. Ranges come from {@link PasteContext.selection}.
 */
import type { RivtoEditorApi } from "../../../editor/types";
import {
  createCaretSelection,
  createStructuralSelection,
} from "../../selection-manager";
import type { EditorPosition } from "../../selection-manager";
import type { ClipboardBundle } from "../clipboard-data";
import type { BlockPrepareErrorHandler } from "../../block-manager/types";
import { cloneSelectedTopLevelSubtrees } from "../utils";
import type {
  PasteContext,
  PastePlacement,
  PasteResult,
  PasteStrategy,
  TextPasteTarget,
} from "./types";
import {
  insertPlainText,
  isBlockPasteContext,
  isPreserveNewlinesPaste,
  isTextPasteContext,
  textAfterId,
  textRangeFromSelection,
} from "./utils";

/** Replaces selected text with partial structured data or newline-split plain text. */
export class TextPasteStrategy implements PasteStrategy {
  /**
   * Creates the text strategy.
   * @param editor - Editor providing block and selection operations.
   */
  constructor(private readonly editor: RivtoEditorApi) {}

  /**
   * Accepts split plain text or a mergeable partial bundle.
   * @param context - Shared clipboard payload.
   * @param placement - Host destination, including merge behavior.
   * @returns True when this strategy should run.
   */
  matches(context: PasteContext, placement: PastePlacement): boolean {
    return isTextPasteContext(context, placement, textRangeFromSelection(this.editor, context.selection));
  }

  /**
   * Merges a partial bundle into the selected range, or inserts split plain text.
   * @param context - Shared clipboard payload.
   * @param placement - Sibling anchor used when no text range is active.
   * @returns Resulting caret, or undefined for empty input.
   */
  paste(context: PasteContext, placement: PastePlacement): PasteResult | undefined {
    const range = textRangeFromSelection(this.editor, context.selection);
    if (context.bundle?.blocks.length && range && context.bundle.startsWithText === true
      && placement.mergeText !== false
    ) return this.pasteBundle(context.bundle, range, context.onPrepareError);
    const caret = this.pastePlainText(context, placement, range);
    return caret ? { proposedSelection: createCaretSelection(caret.blockId, caret.offset) } : undefined;
  }

  /**
   * Merges a partial structured bundle into a text range.
   * @param bundle - Valid partial-text clipboard bundle.
   * @param target - Valid normalized replacement range.
   * @param onPrepareError - Optional one-shot replacement for an invalid imported block.
   * @returns Resulting caret selection and source-to-destination block mapping.
   */
  private pasteBundle(
    bundle: ClipboardBundle,
    target: TextPasteTarget,
    onPrepareError?: BlockPrepareErrorHandler,
  ): PasteResult {
    const destination = target.blocks[0]!;
    const source = bundle.blocks[0]!;
    const suffixBlock = target.blocks.at(-1)!;
    const prefix = destination.content.slice(0, target.startOffset);
    const suffix = suffixBlock.content.slice(target.endOffset);
    const [first, ...rest] = bundle.blocks;
    const idMap = new Map<string, string>([[source.id, destination.id]]);
    let caret = { blockId: destination.id, offset: prefix.length + source.content.length };
    target.blocks.slice(1).forEach((block) => this.editor.blocks.removeBlock(block.id));
    this.editor.blocks.updateBlock(destination.id, {
      content: prefix + source.content + (rest.length ? "" : suffix),
    });
    const children = this.editor.blocks.importForest(first?.children ?? [], destination.id, onPrepareError);
    children.idMap.forEach((id, sourceId) => idMap.set(sourceId, id));
    children.roots.forEach(({ id }) => {
      this.editor.blocks.moveBlock(id, destination.id, "inside");
    });
    const imported = this.editor.blocks.importForest(
      rest.map((block, index) => ({
        ...block,
        content: block.content + (index === rest.length - 1 ? suffix : ""),
      })),
      caret.blockId,
      onPrepareError,
    );
    imported.idMap.forEach((id, sourceId) => idMap.set(sourceId, id));
    imported.roots.forEach(({ id }, index) => {
      caret = { blockId: id, offset: rest[index]?.content.length ?? 0 };
    });
    return { proposedSelection: createCaretSelection(caret.blockId, caret.offset), blockIdMap: idMap };
  }

  /**
   * Inserts plain text, splitting newlines into sibling blocks.
   * @param context - Shared clipboard payload.
   * @param placement - Sibling anchor without a text range.
   * @param range - Replacement range derived from selection.
   * @returns Resulting caret, or undefined for empty input.
   */
  private pastePlainText(
    context: PasteContext,
    placement: PastePlacement,
    range: TextPasteTarget | undefined,
  ): EditorPosition | undefined {
    if (!context.text) return undefined;
    if (!context.defaultBlockType) throw new Error("clipboard.paste requires defaultBlockType for plain-text paste");
    return insertPlainText(
      this.editor,
      context.text,
      context.defaultBlockType,
      true,
      range,
      textAfterId(context, placement, range),
    );
  }
}

/** Inserts plain text as a single block, keeping newline characters. */
export class PreserveNewlinesPasteStrategy implements PasteStrategy {
  /**
   * Creates the preserve-newlines text strategy.
   * @param editor - Editor providing block and selection operations.
   */
  constructor(private readonly editor: RivtoEditorApi) {}

  /**
   * Accepts plain text when the host asked to keep newlines in one block.
   * @param context - Shared clipboard payload.
   * @param placement - Host destination, including the preserve-newlines signal.
   * @returns True when this strategy should run.
   */
  matches(context: PasteContext, placement: PastePlacement): boolean {
    return isPreserveNewlinesPaste(context, placement);
  }

  /**
   * Inserts the clipboard string into one block without splitting on newlines.
   * @param context - Shared clipboard payload.
   * @param placement - Sibling anchor used when no text range is active.
   * @returns Resulting caret, or undefined for empty input.
   */
  paste(context: PasteContext, placement: PastePlacement): PasteResult | undefined {
    if (!context.text) return undefined;
    if (!context.defaultBlockType) throw new Error("clipboard.paste requires defaultBlockType for plain-text paste");
    const range = textRangeFromSelection(this.editor, context.selection);
    const caret = insertPlainText(
      this.editor,
      context.text,
      context.defaultBlockType,
      false,
      range,
      textAfterId(context, placement, range),
    );
    return caret ? { proposedSelection: createCaretSelection(caret.blockId, caret.offset) } : undefined;
  }
}

/** Inserts complete structured bundles as blocks. */
export class BlockPasteStrategy implements PasteStrategy {
  /**
   * Creates the block strategy.
   * @param editor - Editor providing block and selection operations.
   */
  constructor(private readonly editor: RivtoEditorApi) {}

  /**
   * Accepts a block forest that should remain structural.
   * @param context - Shared clipboard payload.
   * @param placement - Host destination, including merge behavior.
   * @returns True when this strategy should run.
   */
  matches(context: PasteContext, placement: PastePlacement): boolean {
    return isBlockPasteContext(context, placement, textRangeFromSelection(this.editor, context.selection));
  }

  /**
   * Inserts remapped roots at a resolved structural destination.
   * @param context - Shared clipboard payload.
   * @param placement - Host destination completed from the current selection.
   * @returns Inserted root ids.
   */
  paste(context: PasteContext, placement: PastePlacement): PasteResult | undefined {
    const bundle = context.bundle;
    if (!bundle?.blocks.length) return undefined;
    const resolved = this.resolvePlacement(context, placement);
    const imported = this.editor.blocks.importForest(
      bundle.blocks,
      resolved.afterId ?? undefined,
      context.onPrepareError,
    );
    const insertedIds = imported.roots.map(({ id }) => id);
    if (resolved.beforeChildId && insertedIds.length) {
      this.editor.blocks.moveBlocks(insertedIds, resolved.beforeChildId, "before");
    } else if (resolved.parentId && resolved.afterId === null && insertedIds.length) {
      this.editor.blocks.moveBlocks(insertedIds, resolved.parentId, "inside");
    }
    return insertedIds.length
      ? { proposedSelection: createStructuralSelection(insertedIds), blockIdMap: imported.idMap }
      : undefined;
  }

  /**
   * Completes host placement from a multi-block or caret selection.
   * @param context - Shared clipboard payload.
   * @param placement - Host-supplied destination.
   * @returns Placement including an inferred first-child move target.
   */
  private resolvePlacement(context: PasteContext, placement: PastePlacement): PastePlacement & {
    readonly beforeChildId?: string;
  } {
    const range = this.editor.selection.resolveBlockSelection(context.selection);
    const multiAfterId = range && range.blocks.length > 1
      ? cloneSelectedTopLevelSubtrees(this.editor.blocks.getBlocks(), range).at(-1)?.id
      : undefined;
    const active = context.selection;
    const afterId = multiAfterId
      ?? active?.focusBlockId
      ?? textRangeFromSelection(this.editor, context.selection)?.blocks[0]?.id;
    const resolved: PastePlacement = placement.parentId !== undefined || placement.afterId !== undefined
      ? (multiAfterId ? { afterId: multiAfterId } : placement)
      : { afterId };
    const beforeChildId = resolved.parentId && resolved.afterId === null
      ? this.editor.blocks.getChildIds(resolved.parentId)[0]
      : undefined;
    return { ...resolved, beforeChildId };
  }
}

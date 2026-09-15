/**
 * Clipboard paste algorithms consulted by ClipboardManager.
 *
 * All flavors share {@link PasteContext}. Placement is a separate destination
 * object. Each strategy decides whether it applies via {@link PasteStrategy.matches}
 * and owns insertion for that case. Ranges come from {@link PasteContext.selection}.
 */
import type { Block } from "@chulane/document-model";
import type { EditorRuntime } from "../../../editor/rivto-editor";
import type { EditorPosition, Selection } from "../../selection-manager";
import {
  createCaretSelection,
  createStructuralSelection,
  isStructuralSelection,
} from "../../selection-manager";
import type { BlockPastePlacement, ClipboardBundle } from "../clipboard-data";
import { cloneSelectedTopLevelSubtrees } from "../utils";

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
  /** Block identities produced by an earlier strategy in this paste pipeline. */
  readonly blockIdMap?: ReadonlyMap<string, string>;
  /** Element identities produced by an earlier strategy in this paste pipeline. */
  readonly elementIdMap?: ReadonlyMap<string, string>;
}

/**
 * Destination for inserted content, independent from clipboard payload.
 *
 * Hosts may supply a sibling or parent anchor. Merge and newline flags live on
 * {@link BlockPastePlacement} so strategies can match without extra context.
 */
export type PastePlacement = BlockPastePlacement;

/** Selection a strategy proposes after writing. */
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

/**
 * Clipboard paste algorithm that accepts or ignores a shared context.
 */
export interface PasteStrategy {
  /**
   * Reports whether this algorithm should run for the clipboard and destination.
   * @param context - Shared clipboard payload.
   * @param placement - Host or derived insertion destination.
   * @returns True when {@link paste} should run.
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

/**
 * Resolves a live replacement range from the paste-time selection.
 * @param editor - Runtime whose selection normalizer and block lengths are used.
 * @param selection - Selection observed when paste started.
 * @returns Range including empty overlap slices, or undefined for structural/empty selection.
 */
export function textRangeFromSelection(
  editor: EditorRuntime,
  selection: Selection | undefined,
): TextPasteTarget | undefined {
  if (!selection) return undefined;
  if (isStructuralSelection(selection)) return undefined;
  const range = editor.selection.resolveBlockSelection(selection);
  if (!range) return undefined;
  return {
    blocks: range.blocks,
    startOffset: range.ranges[0]!.startOffset,
    endOffset: range.ranges.at(-1)!.endOffset,
  };
}

/**
 * Reports whether plain text should stay in one block.
 * @param context - Shared clipboard payload.
 * @param placement - Host destination, including the preserve-newlines signal.
 * @returns True when {@link PreserveNewlinesPasteStrategy} should run.
 */
export function isPreserveNewlinesPaste(context: PasteContext, placement: PastePlacement): boolean {
  return placement.preserveNewlines === true && Boolean(context.text) && !context.bundle?.blocks.length;
}

/**
 * Reports whether the splitting text strategy should own this paste.
 * @param context - Shared clipboard payload.
 * @param placement - Host destination, including merge behavior.
 * @param range - Replacement range derived from selection.
 * @returns True for split plain text or a mergeable partial bundle.
 */
export function isTextPasteContext(
  context: PasteContext,
  placement: PastePlacement,
  range: TextPasteTarget | undefined,
): boolean {
  if (isPreserveNewlinesPaste(context, placement)) return false;
  if (context.bundle?.blocks.length) {
    return Boolean(range && context.bundle.startsWithText === true && placement.mergeText !== false);
  }
  return Boolean(context.text);
}

/**
 * Reports whether the block strategy should insert a structured forest.
 * @param context - Shared clipboard payload.
 * @param placement - Host destination, including merge behavior.
 * @param range - Replacement range derived from selection.
 * @returns True when a block forest should be inserted as blocks.
 */
export function isBlockPasteContext(
  context: PasteContext,
  placement: PastePlacement,
  range: TextPasteTarget | undefined,
): boolean {
  if (!context.bundle?.blocks.length) return false;
  return !isTextPasteContext(context, placement, range);
}

/**
 * Inserts plain text into a range or as sibling blocks.
 * @param editor - Runtime receiving content.
 * @param value - Plain clipboard text.
 * @param defaultBlockType - Registered type for newly created lines.
 * @param splitNewlines - When true, each line becomes a sibling block.
 * @param range - Optional replacement range from selection.
 * @param afterId - Sibling insertion anchor without a text range.
 * @returns Resulting caret, or undefined for empty input.
 */
function insertPlainText(
  editor: EditorRuntime,
  value: string,
  defaultBlockType: string,
  splitNewlines: boolean,
  range: TextPasteTarget | undefined,
  afterId: string | undefined,
): EditorPosition | undefined {
  if (!value) return undefined;
  const prepared = editor.blocksRegistry.prepare({ type: defaultBlockType });
  const lines = splitNewlines ? value.split(/\r\n?|\n/) : [value];
  const destination = range?.blocks[0];
  const suffixBlock = range?.blocks.at(-1);
  const prefix = destination ? destination.content.slice(0, range!.startOffset) : "";
  const suffix = suffixBlock ? suffixBlock.content.slice(range!.endOffset) : "";
  if (range) range.blocks.slice(1).forEach((block) => editor.blocks.removeBlock(block.id));
  let previous = destination?.id ?? afterId;
  let caret: EditorPosition | undefined;
  lines.forEach((line, index) => {
    const last = index === lines.length - 1;
    let offset = line.length;
    if (destination && index === 0) {
      editor.blocks.updateBlock(destination.id, { content: prefix + line + (last ? suffix : "") });
      offset += prefix.length;
    } else {
      previous = editor.blocks.insertBlock({ ...prepared,
        content: line + (last ? suffix : ""),
      }, previous);
    }
    caret = { blockId: previous!, offset };
  });
  return caret;
}

/**
 * Sibling insertion anchor when plain text is not replacing a range.
 * @param context - Shared clipboard payload.
 * @param placement - Host destination.
 * @param range - Replacement range derived from selection.
 * @returns Existing block id to insert after, when known.
 */
function textAfterId(
  context: PasteContext,
  placement: PastePlacement,
  range: TextPasteTarget | undefined,
): string | undefined {
  if (typeof placement.afterId === "string") return placement.afterId;
  if (range) return undefined;
  return context.selection?.focusBlockId;
}

/** Replaces selected text with partial structured data or newline-split plain text. */
export class TextPasteStrategy implements PasteStrategy {
  /**
   * Creates the text strategy.
   * @param editor - Runtime receiving clipboard content.
   */
  constructor(private readonly editor: EditorRuntime) {}

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
    ) return this.pasteBundle(context.bundle, range);
    const caret = this.pastePlainText(context, placement, range);
    return caret ? { proposedSelection: createCaretSelection(caret.blockId, caret.offset) } : undefined;
  }

  /**
   * Merges a partial structured bundle into a text range.
   * @param bundle - Valid partial-text clipboard bundle.
   * @param target - Valid normalized replacement range.
   * @returns Resulting caret selection and source-to-destination block mapping.
   */
  private pasteBundle(bundle: ClipboardBundle, target: TextPasteTarget): PasteResult {
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
    const children = this.editor.blocks.importForest(first?.children ?? [], destination.id);
    children.idMap.forEach((id, sourceId) => idMap.set(sourceId, id));
    children.rootIds.forEach((id) => {
      this.editor.blocks.moveBlock(id, destination.id, "inside");
    });
    const imported = this.editor.blocks.importForest(rest.map((block, index) => ({
        ...block,
        content: block.content + (index === rest.length - 1 ? suffix : ""),
      })), caret.blockId);
    imported.idMap.forEach((id, sourceId) => idMap.set(sourceId, id));
    imported.rootIds.forEach((id, index) => {
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
      this.editor, context.text, context.defaultBlockType, true, range, textAfterId(context, placement, range),
    );
  }
}

/** Inserts plain text as a single block, keeping newline characters. */
export class PreserveNewlinesPasteStrategy implements PasteStrategy {
  /**
   * Creates the preserve-newlines text strategy.
   * @param editor - Runtime receiving clipboard content.
   */
  constructor(private readonly editor: EditorRuntime) {}

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
      this.editor, context.text, context.defaultBlockType, false, range, textAfterId(context, placement, range),
    );
    return caret ? { proposedSelection: createCaretSelection(caret.blockId, caret.offset) } : undefined;
  }
}

/** Inserts complete structured bundles as blocks. */
export class BlockPasteStrategy implements PasteStrategy {
  /**
   * Creates the block strategy.
   * @param editor - Runtime receiving clipboard content.
   */
  constructor(private readonly editor: EditorRuntime) {}

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
    const imported = this.editor.blocks.importForest(bundle.blocks, resolved.afterId ?? undefined);
    const insertedIds = imported.rootIds;
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

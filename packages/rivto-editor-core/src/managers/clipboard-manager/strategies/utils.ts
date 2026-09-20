/**
 * Stateless matching, placement, and plain-text insertion helpers shared by
 * clipboard paste strategies.
 */
import type { RivtoEditorApi } from "../../../editor/types";
import type { EditorPosition, Selection } from "../../selection-manager";
import { isStructuralSelection } from "../../selection-manager";
import type { PasteContext, PastePlacement, TextPasteTarget } from "./types";

/**
 * Resolves a live replacement range from the paste-time selection.
 * @param editor - Editor whose selection manager resolves live block lengths.
 * @param selection - Selection observed when paste started.
 * @returns Range including empty overlap slices, or undefined for structural/empty selection.
 */
export function textRangeFromSelection(
  editor: RivtoEditorApi,
  selection: Selection | undefined,
): TextPasteTarget | undefined {
  if (!selection || isStructuralSelection(selection)) return undefined;
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
 * @returns Whether the preserve-newlines strategy should run.
 */
export function isPreserveNewlinesPaste(context: PasteContext, placement: PastePlacement): boolean {
  return placement.preserveNewlines === true && Boolean(context.text) && !context.bundle?.blocks.length;
}

/**
 * Reports whether the splitting text strategy should own this paste.
 * @param context - Shared clipboard payload.
 * @param placement - Host destination, including merge behavior.
 * @param range - Replacement range derived from selection.
 * @returns Whether this is split plain text or a mergeable partial bundle.
 */
export function isTextPasteContext(
  context: PasteContext,
  placement: PastePlacement,
  range: TextPasteTarget | undefined,
): boolean {
  if (isPreserveNewlinesPaste(context, placement)) return false;
  if (context.bundle?.blocks.length) {
    return Boolean(range && context.bundle.fromTextSelection === true && placement.mergeText !== false);
  }
  return Boolean(context.text);
}

/**
 * Reports whether the block strategy should insert a structured forest.
 * @param context - Shared clipboard payload.
 * @param placement - Host destination, including merge behavior.
 * @param range - Replacement range derived from selection.
 * @returns Whether a block forest should be inserted as blocks.
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
 * @param editor - Editor receiving block mutations.
 * @param value - Plain clipboard text.
 * @param defaultBlockType - Registered type for newly created lines.
 * @param splitNewlines - When true, each line becomes a sibling block.
 * @param range - Optional replacement range from selection.
 * @param afterId - Sibling insertion anchor without a text range.
 * @returns Resulting caret, or undefined for empty input.
 */
export function insertPlainText(
  editor: RivtoEditorApi,
  value: string,
  defaultBlockType: string,
  splitNewlines: boolean,
  range: TextPasteTarget | undefined,
  afterId: string | undefined,
): EditorPosition | undefined {
  if (!value) return undefined;
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
      previous = editor.blocks.insertBlock({
        type: defaultBlockType,
        content: line + (last ? suffix : ""),
      }, previous).id;
    }
    caret = { blockId: previous!, offset };
  });
  return caret;
}

/**
 * Resolves a sibling insertion anchor when plain text is not replacing a range.
 * @param context - Shared clipboard payload.
 * @param placement - Host destination.
 * @param range - Replacement range derived from selection.
 * @returns Existing block ID to insert after, when known.
 */
export function textAfterId(
  context: PasteContext,
  placement: PastePlacement,
  range: TextPasteTarget | undefined,
): string | undefined {
  if (typeof placement.afterId === "string") return placement.afterId;
  if (range) return undefined;
  return context.selection?.focusBlockId;
}

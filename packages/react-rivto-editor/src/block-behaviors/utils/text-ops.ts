/**
 * Text-splitting and merge primitives used by block behaviors.
 *
 * These helpers wrap core `updateBlock`, `insertBlock`, and `mergeBlocks` so
 * Enter and boundary-delete behaviors share one implementation of text splitting at the caret
 * and list-property inheritance.
 *
 * @module
 */
import { createCaretSelection, type EditorBlock } from "@chulane/rivto";
import type { KeyboardSelectionTarget } from "../../managers/keyboard/selection";
import type { BlockEditingPanel, BlockKeyboardContext, BlockBehaviorOutcome } from "../types";
import { focusCaret, scheduleBlockFocus } from "./focus-ops";
import { createBlockOutlineContext } from "./context";

/**
 * Slices a block at a caret and inserts a following writing block.
 *
 * The caller supplies continuation list properties when its onSplit owns list
 * inheritance; omitted properties retain the writing factory's defaults. The
 * caller decides whether the new block should then indent under the source's
 * visible children. This helper does not create its own transaction.
 *
 * @param reactPanel - Editor view providing writing factories and document commands.
 * @param block - Source block whose content is split.
 * @param splitAt - Inclusive UTF-16 offset kept on the source block.
 * @param listProps - Complete continuation list input, replacing factory list
 * properties when supplied; core preparation still applies defaults and validation.
 * @returns Complete inserted block with model selection at its start.
 * @throws If a delegated block update, insertion, or list-property validation fails.
 */
export function splitBlockAt(
  reactPanel: BlockEditingPanel,
  block: EditorBlock,
  splitAt: number,
  listProps?: EditorBlock["listProps"],
): EditorBlock {
  const clamped = Math.max(0, Math.min(splitAt, block.content.length));
  const destination = reactPanel.blocks.canRemove(block.id)
    ? reactPanel.blocks.getInsertionDestinationAfter(block.id)
    : { parentId: block.id, beforeId: block.children[0]?.id };
  reactPanel.blocks.updateBlock(block.id, { content: block.content.slice(0, clamped) });
  const nextBlock = reactPanel.blocks.insertBlock(
    {
      ...reactPanel.editor.defaultWritingBlockFactory.createEmptyBlock(),
      ...(listProps ? { listProps } : {}),
      content: block.content.slice(clamped),
    },
    destination,
  );
  reactPanel.selection.set(createCaretSelection(nextBlock.id, 0));
  return nextBlock;
}

/**
 * Splits at the caret or lifts one outline level using the shared Enter algorithm.
 *
 * The caller owns the transaction and continuation list properties. Expanded
 * branches receive the new block as their first child; collapsed branches keep
 * it as a sibling. Edgeless root splits extend the containing card's range.
 * Model selection changes immediately and DOM focus is scheduled after rendering.
 * Empty-block outdent resolves fresh shallow fields and current model selection,
 * then dispatches parent and child handlers in its own nested panel batch.
 *
 * @param context - Source snapshot, live panel commands, and originating input attachment.
 * @param target - Captured caret; a noncollapsed structural target splits at the end.
 * @param listProps - Continuation list properties, or undefined to use writing defaults.
 * @returns `"handled"` after insertion or an outdent attempt, including attempts rejected by parent outline handlers.
 * @throws If delegated block mutation, hierarchy, or list-property validation fails.
 */
export function splitBlock(
  context: BlockKeyboardContext,
  target: KeyboardSelectionTarget,
  listProps?: EditorBlock["listProps"],
): BlockBehaviorOutcome {
  const { reactPanel, block, inputRoot } = context;
  const attachment = inputRoot ?? reactPanel.inputRoot;
  const { defaultWritingBlockFactory } = reactPanel.editor;
  // Outdent empty block if
  if (
    defaultWritingBlockFactory.isEmptyBlock(reactPanel.blocks.getBlockNode(block.id)!) &&
    reactPanel.blocks.canOutdent(block.id)
  ) {
    // Lift one permitted level per Enter, stopping at container outline floors.
    const outlineContext = createBlockOutlineContext(
      reactPanel,
      block.id,
      reactPanel.selection.get(),
    );
    if (outlineContext) {
      reactPanel.batchUpdates(() =>
        reactPanel.editor.blockBehaviors.dispatch("onOutdent", outlineContext, [block.id]),
      );
    }
    focusCaret(reactPanel, block.id, 0, attachment, context.inputRegistration);
    return "handled";
  }
  const splitAt = target.collapsed
    ? Math.min(target.offset ?? 0, block.content.length)
    : block.content.length;
  const nextBlock = splitBlockAt(reactPanel, block, splitAt, listProps);
  // Core mode can be edgeless while Enter comes from a page embedding.
  // Only extend the canvas card's block range when editing its edgeless view.
  if (
    reactPanel.blocks.canRemove(block.id) &&
    block.children.length > 0 &&
    // Enter enters an expanded branch; a collapsed branch keeps the new writing block as a sibling.
    reactPanel.editor.blockBehaviors.childrenVisible(block)
  ) {
    // Insertion created a sibling. Indent then prepend so Enter places the
    // new writing block as the first visible child.
    reactPanel.blocks.indentBlock(nextBlock.id);
    reactPanel.blocks.moveBlock(nextBlock.id, null);
  } else {
    extendEdgelessBlockRange(reactPanel, block.id, nextBlock.id);
  }
  scheduleBlockFocus(reactPanel, nextBlock.id, 0, attachment, context.inputRegistration);
  return "handled";
}

/**
 * Extends a canvas card ending at a newly split root block.
 *
 * Page surfaces and non-root blocks do not change a canvas card's range.
 *
 * @param reactPanel - Occurrence supplying surface type and document operations.
 * @param blockId - Original block whose content was split.
 * @param nextBlockId - Newly inserted block following the original.
 * @returns The matching card range is updated when the split ends its range.
 * @throws Propagates surface, hierarchy, element lookup, and update failures.
 */
function extendEdgelessBlockRange(
  reactPanel: BlockEditingPanel,
  blockId: string,
  nextBlockId: string,
): void {
  if (
    reactPanel.getSurfaceType() !== "edgeless" ||
    !reactPanel.blocks.getRootIds().includes(blockId)
  ) {
    return;
  }
  const element = reactPanel.elements
    .getElementNodes()
    .find((candidate) => candidate.type === "block" && candidate.props.endBlockId === blockId);
  if (element) {
    reactPanel.elements.updateElement(element.id, { props: { endBlockId: nextBlockId } });
  }
}

/**
 * Converts an empty non-list block into a list item in place.
 *
 * @param reactPanel - Editor view whose list-prop registration must be active.
 * @param blockId - Empty block to convert.
 * @returns Nothing; the same block keeps the caret.
 */
export function convertEmptyToList(reactPanel: BlockEditingPanel, blockId: string): void {
  reactPanel.blocks.updateBlock(blockId, { listProps: { type: "list", checked: false } });
  reactPanel.selection.set(createCaretSelection(blockId, 0));
}

/**
 * Appends a source block into a surviving target and returns the join offset.
 *
 * @param reactPanel - Editor view owning the core merge command.
 * @param targetId - Block that remains after the merge.
 * @param sourceId - Block transferred and removed.
 * @returns Target content offset where the source text begins.
 */
export function mergeBlocks(
  reactPanel: BlockEditingPanel,
  targetId: string,
  sourceId: string,
): number {
  const joinOffset = reactPanel.blocks.mergeBlocks(targetId, sourceId);
  reactPanel.selection.set(createCaretSelection(targetId, joinOffset));
  return joinOffset;
}

/**
 * Resets a custom block to the host writing type.
 *
 * @param reactPanel - Editor view providing the writing-type factory.
 * @param blockId - Block whose native type is replaced.
 * @returns Nothing; identity is preserved.
 */
export function resetToWritingType(reactPanel: BlockEditingPanel, blockId: string): void {
  reactPanel.blocks.setBlockType(
    blockId,
    reactPanel.editor.defaultWritingBlockFactory.createEmptyBlock().type,
  );
}

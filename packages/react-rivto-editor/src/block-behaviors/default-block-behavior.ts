/**
 * Generic outline behavior shared by every unregistered or unconstrained block.
 *
 * This class holds the page Enter/Tab/Backspace/Delete semantics previously
 * registered by the focused modules under `extensions/built-ins/page`. Container behaviors override individual methods
 * and return `"default"` to reuse this implementation. The DOM shell component
 * `blocks/block-view/block-view.tsx` is unrelated presentation.
 *
 * @module
 */
import { removeEmptyBlockAfterStructuralPredecessor } from "../extensions/built-ins/page/block-merge/utils";
import { navigationDomRoot } from "../extensions/built-ins/page/navigation/utils/scope";
import type { KeyboardSelectionTarget } from "../managers/events/selection";
import {
  findNextEditableBlock,
  findParentBlock,
  findPreviousEditableBlock,
  findRenderedBlock,
} from "../managers/events/block-dom";
import { focusCaret, scheduleBlockFocus } from "./ops/focus-ops";
import { indentBlocks, outdentBlocks } from "./ops/outline-ops";
import { mergeBlocks, resetToWritingType, splitBlockAt } from "./ops/text-ops";
import type {
  BlockBehavior,
  BlockBehaviorContext,
  BlockBehaviorOutcome,
  BlockDropContext,
  DropAxis,
} from "./types";

/**
 * Default block behavior used when a type registers no specialized behavior.
 *
 * Instances are stateless. {@link BlockBehaviorRegistry} keeps one shared fallback.
 */
export class DefaultBlockBehavior implements BlockBehavior {
  /** Child layout direction used for drag placement, if this type defines one. */
  readonly dropAxis?: DropAxis;
  readonly dropChildTypes?: readonly string[];
  readonly dropParentTypes?: readonly string[];
  /** Whether the complete BlockView is a drop target, including empty lanes. */
  readonly acceptsDropContainer: boolean = false;

  /**
   * Splits at the caret, clears an empty list marker, or lifts one outline level.
   *
   * @param context - Block that owns the Enter event.
   * @param target - Caret or structural keyboard target.
   * @returns `"handled"` after a list action, insertion, or outdent attempt, including when containment prevents the move.
   */
  onSplit(context: BlockBehaviorContext, target: KeyboardSelectionTarget): BlockBehaviorOutcome {
    const { editorView, block, root } = context;
    const { isEmptyBlock } = editorView.runtime;
    if (editorView.runtime.blockListProps.onSplit(context)) return "handled";
    if (isEmptyBlock(block) && editorView.runtime.blocks.getParentId(block.id)) {
      // Lift one permitted level per Enter, stopping at container outline floors.
      outdentBlocks(editorView, [block.id]);
      focusCaret(editorView, root, block.id, 0);
      return "handled";
    }
    const splitAt = target.collapsed
      ? Math.min(target.offset ?? 0, block.content.length)
      : block.content.length;
    const nextBlock = splitBlockAt(editorView, block, splitAt);
    // Core mode can be edgeless while Enter comes from a page embedding.
    // Only extend the canvas card's block range when editing its edgeless view.
    if (block.children.length > 0 && editorView.runtime.blockListProps.childrenVisible(block)) {
      // Insertion created a sibling. Indent then prepend so Enter places the
      // new writing block as the first visible child.
      editorView.runtime.blocks.indentBlock(nextBlock.id);
      editorView.runtime.blocks.moveBlock(nextBlock.id, null);
    } else if (editorView.events.getSurfaceType() === "edgeless" && editorView.runtime.blocks.isRootBlock(block.id)) {
      const element = editorView.runtime.elements.getElements().find((candidate) =>
        candidate.type === "block" && candidate.props.endBlockId === block.id,
      );
      if (element) editorView.runtime.elements.updateElement(element.id, { props: { endBlockId: nextBlock.id } });
    }
    scheduleBlockFocus(editorView, root, nextBlock.id, 0);
    return "handled";
  }

  /**
   * Indents the supplied outline roots through the core command.
   *
   * @param context - First selected block, used only for the editor handle.
   * @param ids - Identifiers to indent together.
   * @returns `"handled"` after the command runs, including containment no-ops.
   */
  onIndent(context: BlockBehaviorContext, ids: readonly string[]): BlockBehaviorOutcome {
    indentBlocks(context.editorView, ids);
    return "handled";
  }

  /**
   * Outdents the supplied outline roots through the core command.
   *
   * @param context - First selected block, used only for the editor handle.
   * @param ids - Identifiers to outdent together.
   * @returns `"handled"` after the command runs, including floor no-ops.
   */
  onOutdent(context: BlockBehaviorContext, ids: readonly string[]): BlockBehaviorOutcome {
    outdentBlocks(context.editorView, ids);
    return "handled";
  }

  /**
   * Outdents a nested block at a collapsed start caret.
   *
   * @param context - Nested block that owns the caret.
   * @param target - Collapsed caret at offset zero.
   * @returns `"handled"` when the block is nested, otherwise `"default"`.
   */
  onOutdentAtStart(context: BlockBehaviorContext, target: KeyboardSelectionTarget): BlockBehaviorOutcome {
    const rendered = findRenderedBlock(context.root, target.blockId);
    if (!rendered || !findParentBlock(rendered)) return "default";
    outdentBlocks(context.editorView, [target.blockId]);
    scheduleBlockFocus(context.editorView, context.root, target.blockId, 0);
    return "handled";
  }

  /**
   * Merges a root block into the previous editable sibling, or removes it.
   *
   * @param context - Root block that owns the caret.
   * @param target - Collapsed caret at offset zero.
   * @returns `"handled"` when a merge or structural removal ran; `"default"` when this method cannot apply the operation.
   */
  onMergeBackward(context: BlockBehaviorContext, target: KeyboardSelectionTarget): BlockBehaviorOutcome {
    const { editorView, root } = context;
    const rendered = findRenderedBlock(root, target.blockId);
    if (rendered && findParentBlock(rendered)) return "default";
    const scope = navigationDomRoot(root, target.blockId);
    if (removeEmptyBlockAfterStructuralPredecessor(editorView, scope, target.blockId)) return "handled";
    const previous = findPreviousEditableBlock(scope, target.blockId);
    if (!previous) return "default";
    const joinOffset = mergeBlocks(editorView, previous.blockId, target.blockId);
    scheduleBlockFocus(editorView, root, previous.blockId, joinOffset);
    return "handled";
  }

  /**
   * Merges the next editable sibling at a collapsed end caret.
   *
   * @param context - Block that owns a caret at its content end.
   * @param target - Collapsed end caret.
   * @returns `"handled"` when a merge or structural removal ran; `"default"` when this method cannot apply the operation.
   */
  onMergeForward(context: BlockBehaviorContext, target: KeyboardSelectionTarget): BlockBehaviorOutcome {
    const { editorView, block, root } = context;
    if (!editorView.runtime.blockListProps.childrenVisible(block)) return "default";
    const scope = navigationDomRoot(root, block.id);
    if (removeEmptyBlockAfterStructuralPredecessor(editorView, scope, block.id)) return "handled";
    const next = findNextEditableBlock(scope, target.blockId);
    if (!next) return "default";
    const joinOffset = mergeBlocks(editorView, block.id, next.blockId);
    scheduleBlockFocus(editorView, root, block.id, joinOffset);
    return "handled";
  }

  /**
   * Resets the first empty custom block to the host writing type.
   *
   * @param context - Empty custom block with no previous editable sibling.
   * @param target - Collapsed caret at offset zero.
   * @returns `"handled"` when the type was reset; `"default"` for nonempty blocks, writing blocks, or blocks with an editable predecessor.
   */
  onResetEmpty(context: BlockBehaviorContext, target: KeyboardSelectionTarget): BlockBehaviorOutcome {
    const { editorView, block, root } = context;
    if (block.content !== "" || editorView.runtime.isEmptyBlock(block)) return "default";
    const scope = navigationDomRoot(root, block.id);
    if (findPreviousEditableBlock(scope, target.blockId)) return "default";
    resetToWritingType(editorView, block.id);
    scheduleBlockFocus(editorView, root, block.id, 0);
    return "handled";
  }

  /**
   * Generic blocks do not relocate children before a structural delete.
   *
   * @param _context - Unused selected-block context.
   * @param _ids - Unused structural selection.
   * @returns `"default"` so the shared selection-deletion path proceeds.
   */
  onStructuralDelete(_context: BlockBehaviorContext, _ids: readonly string[]): BlockBehaviorOutcome {
    return "default";
  }

  /**
   * Generic blocks accept children through their editable row.
   *
   * @param _context - Unused drop destination.
   * @returns `true`; full-body container targeting is controlled separately.
   */
  acceptsDrop(_context: BlockDropContext): boolean {
    return true;
  }
}

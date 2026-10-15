import type { BlockBehaviorAvailabilityContext } from "./types";
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
import { scheduleBlockFocus } from "./utils/focus-ops";
import { indentBlocks, outdentBlocks } from "./utils/outline-ops";
import { mergeBlocks, resetToWritingType, splitBlock } from "./utils/text-ops";
import type { BlockBehavior, BlockBehaviorContext, BlockBehaviorOutcome } from "./types";

/**
 * Default block behavior used after higher-priority applicable handlers defer.
 *
 * Instances are stateless. {@link BlockBehaviorRegistry} installs one instance as an ordinary low-priority registration.
 */
export class DefaultBlockBehavior implements BlockBehavior {
  /**
   * Makes generic outline handling available after higher-priority behaviors defer.
   * @param context - Current block fields and runtime; generic behavior has no applicability restriction.
   * @returns Always true, including for unknown native types.
   */
  isAvailable(context: BlockBehaviorAvailabilityContext): boolean {
    return true;
  }

  /**
   * Splits at the caret or lifts one outline level after specialized behaviors defer.
   *
   * Uses the writing factory's continuation defaults. List behaviors supply their
   * own properties to the same shared algorithm. The caller owns the transaction;
   * model selection updates immediately and DOM focus is scheduled after rendering.
   *
   * @param context - Block that owns the Enter event.
   * @param target - Caret or structural keyboard target.
   * @returns `"handled"` after insertion or an outdent attempt, including when containment prevents the move.
   * @throws If delegated block mutation, hierarchy, or list-property validation fails.
   */
  onSplit(context: BlockBehaviorContext, target: KeyboardSelectionTarget): BlockBehaviorOutcome {
    return splitBlock(context, target);
  }

  /**
   * Indents the supplied outline roots through the core command.
   *
   * @param context - First selected block, used only for the editor handle.
   * @param ids - Identifiers to indent together.
   * @returns `"handled"` after the command runs, including containment no-ops.
   */
  onIndent(context: BlockBehaviorContext, ids: readonly string[]): BlockBehaviorOutcome {
    indentBlocks(context.reactPanel, ids);
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
    outdentBlocks(context.reactPanel, ids);
    return "handled";
  }

  /**
   * Outdents a nested block at a collapsed start caret.
   *
   * @param context - Nested block that owns the caret.
   * @param target - Collapsed caret at offset zero.
   * @returns `"handled"` when the block is nested, otherwise `"default"`.
   */
  onOutdentAtStart(
    context: BlockBehaviorContext,
    target: KeyboardSelectionTarget,
  ): BlockBehaviorOutcome {
    const rendered = findRenderedBlock(context.root, target.blockId);
    if (!rendered || !findParentBlock(rendered)) {
      return "default";
    }
    outdentBlocks(context.reactPanel, [target.blockId]);
    scheduleBlockFocus(context.reactPanel, context.root, target.blockId, 0);
    return "handled";
  }

  /**
   * Merges a root block into the previous editable sibling, or removes it.
   *
   * @param context - Root block that owns the caret.
   * @param target - Collapsed caret at offset zero.
   * @returns `"handled"` when a merge or structural removal ran; `"default"` when this method cannot apply the operation.
   */
  onMergeBackward(
    context: BlockBehaviorContext,
    target: KeyboardSelectionTarget,
  ): BlockBehaviorOutcome {
    const { reactPanel, root } = context;
    const rendered = findRenderedBlock(root, target.blockId);
    if (rendered && findParentBlock(rendered)) {
      return "default";
    }
    const scope = navigationDomRoot(root, target.blockId);
    if (removeEmptyBlockAfterStructuralPredecessor(reactPanel, scope, target.blockId)) {
      return "handled";
    }
    const previous = findPreviousEditableBlock(scope, target.blockId);
    if (!previous) {
      return "default";
    }
    const joinOffset = mergeBlocks(reactPanel, previous.blockId, target.blockId);
    scheduleBlockFocus(reactPanel, root, previous.blockId, joinOffset);
    return "handled";
  }

  /**
   * Merges the next editable sibling at a collapsed end caret.
   *
   * @param context - Block that owns a caret at its content end.
   * @param target - Collapsed end caret.
   * @returns `"handled"` when a merge or structural removal ran; `"default"` when this method cannot apply the operation.
   */
  onMergeForward(
    context: BlockBehaviorContext,
    target: KeyboardSelectionTarget,
  ): BlockBehaviorOutcome {
    const { reactPanel, block, root } = context;
    // Forward Delete must not merge across a collapsed branch whose children are hidden from the caret.
    if (!reactPanel.editor.blockBehaviors.childrenVisible(block)) {
      return "default";
    }
    const scope = navigationDomRoot(root, block.id);
    if (removeEmptyBlockAfterStructuralPredecessor(reactPanel, scope, block.id)) {
      return "handled";
    }
    const next = findNextEditableBlock(scope, target.blockId);
    if (!next) {
      return "default";
    }
    const joinOffset = mergeBlocks(reactPanel, block.id, next.blockId);
    scheduleBlockFocus(reactPanel, root, block.id, joinOffset);
    return "handled";
  }

  /**
   * Resets the first empty custom block to the host writing type.
   *
   * @param context - Empty custom block with no previous editable sibling.
   * @param target - Collapsed caret at offset zero.
   * Custom blocks keep the existing empty-text eligibility rule. Specialized
   * behavior may refuse reset through its onResetEmpty implementation.
   * @returns `"handled"` when the type was reset; `"default"` for nonempty blocks, writing blocks, or blocks with an editable predecessor.
   */
  onResetEmpty(
    context: BlockBehaviorContext,
    target: KeyboardSelectionTarget,
  ): BlockBehaviorOutcome {
    const { reactPanel, block, root } = context;
    if (block.content !== "") {
      return "default";
    }
    const candidate = reactPanel.blocks.getBlockNode(block.id)!;
    const defaultWritingBlockFactory = reactPanel.editor.defaultWritingBlockFactory;
    if (defaultWritingBlockFactory.isEmptyBlock(candidate)) {
      return "default";
    }
    const scope = navigationDomRoot(root, block.id);
    if (findPreviousEditableBlock(scope, target.blockId)) {
      return "default";
    }
    resetToWritingType(reactPanel, block.id);
    scheduleBlockFocus(reactPanel, root, block.id, 0);
    return "handled";
  }

  /**
   * Generic blocks do not relocate children before a structural delete.
   *
   * @param context - Unused selected-block context.
   * @param ids - Unused structural selection.
   * @returns `"default"` so the shared selection-deletion path proceeds.
   */
  onStructuralDelete(context: BlockBehaviorContext, ids: readonly string[]): BlockBehaviorOutcome {
    return "default";
  }
}

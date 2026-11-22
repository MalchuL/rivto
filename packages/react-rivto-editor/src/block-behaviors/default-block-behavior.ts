import type { BlockInput } from "@chulane/document-model";
/**
 * Generic outline behavior shared by every unregistered or unconstrained block.
 *
 * This class holds the page Enter/Tab/Backspace/Delete semantics previously
 * registered by the focused modules under `extensions/built-ins/page`. Container behaviors override individual methods
 * and return `"unhandled"` to reuse this implementation. The DOM shell component
 * `blocks/block-view/block-view.tsx` is unrelated presentation.
 *
 * @module
 */
import { removeEmptyBlockAfterStructuralPredecessor } from "../extensions/built-ins/page/block-merge/utils";
import { removeFirstEmptyBlock } from "../extensions/built-ins/page/block-merge/remove-first-empty-block";
import { navigationDomRoot } from "../extensions/built-ins/page/navigation/utils/scope";
import type { KeyboardSelectionTarget } from "../managers/keyboard/selection";
import { findAdjacentEditableBlock, findParentBlock, findRenderedBlock } from "../dom/block-dom";
import { scheduleBlockFocus } from "./utils/focus-ops";
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
   * @param context - Current block fields; generic behavior has no applicability restriction.
   * @returns Always true, including for unknown native types.
   */
  isAvailable(context: BlockInput): boolean {
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
   * @returns `"handled"` after insertion or an outdent attempt, including when a parent behavior prevents the move.
   * @throws If delegated block mutation, hierarchy, or list-property validation fails.
   */
  onSplit(context: BlockBehaviorContext, target: KeyboardSelectionTarget): BlockBehaviorOutcome {
    return splitBlock(context, target);
  }

  /**
   * Merges a root block into the previous editable sibling, or removes it.
   *
   * @param context - Root block that owns the caret.
   * @param target - Collapsed caret at offset zero.
   * @returns `"handled"` when a merge or structural removal ran; `"unhandled"` when this method cannot apply the operation.
   */
  onMergeBackward(
    context: BlockBehaviorContext,
    target: KeyboardSelectionTarget,
  ): BlockBehaviorOutcome {
    const { reactPanel, root } = context;
    if (removeFirstEmptyBlock(reactPanel, root, target.blockId)) {
      // The empty block was handled before a sibling merge was needed.
      return "handled";
    }
    const rendered = findRenderedBlock(root, target.blockId);
    if (rendered && findParentBlock(rendered)) {
      return "unhandled";
    }
    const scope = navigationDomRoot(root, target.blockId);
    if (removeEmptyBlockAfterStructuralPredecessor(reactPanel, scope, target.blockId)) {
      return "handled";
    }
    const previous = findAdjacentEditableBlock(scope, target.blockId, "previous");
    if (!previous) {
      return "unhandled";
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
   * @returns `"handled"` when a merge or structural removal ran; `"unhandled"` when this method cannot apply the operation.
   */
  onMergeForward(
    context: BlockBehaviorContext,
    target: KeyboardSelectionTarget,
  ): BlockBehaviorOutcome {
    const { reactPanel, block, root } = context;
    // Forward Delete must not merge across a collapsed branch whose children are hidden from the caret.
    if (!reactPanel.editor.blockBehaviors.childrenVisible(block)) {
      return "unhandled";
    }
    const scope = navigationDomRoot(root, block.id);
    if (removeEmptyBlockAfterStructuralPredecessor(reactPanel, scope, block.id)) {
      return "handled";
    }
    const next = findAdjacentEditableBlock(scope, target.blockId, "next");
    if (!next) {
      return "unhandled";
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
   * @returns `"handled"` when the type was reset; `"unhandled"` for nonempty blocks, writing blocks, or blocks with an editable predecessor.
   */
  onResetEmpty(
    context: BlockBehaviorContext,
    target: KeyboardSelectionTarget,
  ): BlockBehaviorOutcome {
    const { reactPanel, block, root } = context;
    if (block.content !== "") {
      return "unhandled";
    }
    const candidate = reactPanel.blocks.getBlockNode(block.id)!;
    const defaultWritingBlockFactory = reactPanel.editor.defaultWritingBlockFactory;
    if (defaultWritingBlockFactory.isEmptyBlock(candidate)) {
      return "unhandled";
    }
    const scope = navigationDomRoot(root, block.id);
    if (findAdjacentEditableBlock(scope, target.blockId, "previous")) {
      return "unhandled";
    }
    resetToWritingType(reactPanel, block.id);
    scheduleBlockFocus(reactPanel, root, block.id, 0);
    return "handled";
  }
}

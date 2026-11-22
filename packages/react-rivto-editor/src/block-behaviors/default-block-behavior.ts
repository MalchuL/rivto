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
import {
  navigationDomRoot,
  owningBlockElement,
} from "../extensions/built-ins/page/navigation/utils/scope";
import type { KeyboardSelectionTarget } from "../managers/keyboard/selection";
import { findAdjacentEditableBlock, findParentBlock, findRenderedBlock } from "../dom/block-dom";
import { focusCaret, scheduleBlockFocus } from "./utils/focus-ops";
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
   * Outdents a nested block at a collapsed start caret.
   *
   * Resolves fresh shallow block fields and current model selection before
   * dispatching parent and child handlers in one panel batch. A missing block
   * skips dispatch; DOM focus is still scheduled after the outdent attempt,
   * including when the parent rejects it.
   *
   * @param context - Nested block that owns the caret.
   * @param target - Collapsed caret at offset zero.
   * @returns `"handled"` when the block is nested, otherwise `"unhandled"`.
   * @throws If hierarchy reads, a behavior, a delegated mutation, or focus scheduling fails.
   */
  onOutdentAtStart(
    context: BlockBehaviorContext,
    target: KeyboardSelectionTarget,
  ): BlockBehaviorOutcome {
    if (this.removeFirstEmptyBlock(context)) {
      // The first empty block already consumed Backspace.
      return "handled";
    }
    const rendered = findRenderedBlock(context.root, target.blockId);
    if (!rendered || !findParentBlock(rendered)) {
      return "unhandled";
    }
    const { reactPanel } = context;
    if (reactPanel.blocks.canOutdent(target.blockId)) {
      reactPanel.batchUpdates(() => reactPanel.blocks.outdentBlocks([target.blockId]));
    }
    scheduleBlockFocus(reactPanel, context.root, target.blockId, 0);
    return "handled";
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
    if (this.removeFirstEmptyBlock(context)) {
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

  /**
   * Removes a first empty writing block or the only block in its surface.
   *
   * Leaves child-bearing blocks intact. An empty surface retains keyboard focus
   * so undo remains available after its last block is removed.
   *
   * A structural behavior can consume Backspace while keeping the block. Wait for generic
   * removal to succeed before changing card endpoints, discarding geometry, or moving focus.
   *
   * @param context - Block and surface receiving Backspace.
   * @returns Whether Backspace was consumed, including when a structural behavior vetoed removal.
   */
  private removeFirstEmptyBlock(context: BlockBehaviorContext): boolean {
    const { reactPanel, block, root } = context;
    const node = reactPanel.blocks.getBlockNode(block.id);
    // Keep subtrees, panel boundary roots, and semantically nonempty writing blocks intact.
    if (
      !node ||
      node.childIds.length ||
      !reactPanel.blocks.canRemove(block.id) ||
      !reactPanel.editor.defaultWritingBlockFactory.isEmptyBlock(node)
    ) {
      // Defer to the normal Backspace behavior for this block.
      return false;
    }
    const parentId = reactPanel.blocks.getParentId(block.id);
    const siblings =
      parentId == null ? reactPanel.blocks.getRootIds() : reactPanel.blocks.getChildIds(parentId);
    const index = siblings.indexOf(block.id);
    // A card can start after the first document root; nested blocks use their own sibling list.
    const card =
      parentId == null && reactPanel.getSurfaceType() === "edgeless"
        ? owningBlockElement(reactPanel, block.id)
        : undefined;
    if (index < 0 || (index !== 0 && card?.props.startBlockId !== block.id)) {
      // Only the first block in this editing region qualifies.
      return false;
    }
    const nextSibling = siblings[index + 1];
    // A single-block card has no next block in its surface, even if document roots follow it.
    if (siblings.length === 1 || (card && card.props.endBlockId === block.id)) {
      // Keep cards with element children or another endpoint intact.
      const cards = reactPanel.elements
        .getElementNodes()
        .filter(
          (element) =>
            element.type === "block" &&
            (element.props.startBlockId === block.id || element.props.endBlockId === block.id),
        );
      if (
        cards.some(
          (element) =>
            element.childIds.length ||
            element.props.startBlockId !== block.id ||
            element.props.endBlockId !== block.id,
        )
      ) {
        // Preserve a card that owns other content or spans additional blocks.
        return false;
      }
      reactPanel.batchUpdates(() => {
        if (!reactPanel.blocks.removeBlocks([block.id])) {
          // A structural handler kept the block, so retain its card and focus.
          return;
        }
        cards.forEach((element) => reactPanel.elements.removeElement(element.id));
        reactPanel.selection.clear();
        root.focus({ preventScroll: true });
      });
      // Backspace was consumed even if a structural handler kept the block.
      return true;
    }
    if (!nextSibling) {
      // Without a successor, another behavior owns this boundary.
      return false;
    }
    const scope = navigationDomRoot(root, block.id);
    const next = findAdjacentEditableBlock(scope, block.id, "next");
    // Do not skip a structural block or move focus into another card or descendant.
    if (!next || next.blockId !== nextSibling) {
      // Only the immediate editable sibling can receive the caret.
      return false;
    }
    // Keep card ranges and block deletion in the same undo item; publish focus after removal.
    reactPanel.batchUpdates(() => {
      if (!reactPanel.blocks.removeBlocks([block.id])) {
        // A veto leaves the card endpoints and selection intact.
        return;
      }
      for (const element of reactPanel.elements.getElementNodes()) {
        if (element.type !== "block") {
          continue;
        }
        const { startBlockId, endBlockId } = element.props;
        if (startBlockId === block.id || endBlockId === block.id) {
          reactPanel.elements.updateElement(element.id, {
            props: {
              startBlockId: startBlockId === block.id ? next.blockId : startBlockId,
              endBlockId: endBlockId === block.id ? next.blockId : endBlockId,
            },
          });
        }
      }
      focusCaret(reactPanel, root, next.blockId, 0);
    });
    return true;
  }
}

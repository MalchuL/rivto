import type { BlockBehaviorAvailabilityContext } from "./types";
import type { BlockDestination } from "@chulane/document-model";
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
import type { KeyboardSelectionTarget } from "../managers/keyboard/selection";
import { scheduleBlockFocus } from "./utils/focus-ops";
import { createBlockOutlineContext } from "./utils/context";
import { mergeBlocks, resetToWritingType, splitBlock } from "./utils/text-ops";
import type {
  BlockBehavior,
  BlockOutlinePanel,
  BlockKeyboardContext,
  BlockSnapshotContext,
  BlockOutlineContext,
  BlockBehaviorOutcome,
} from "./types";

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
   * @returns `"handled"` after insertion or an outdent attempt, including when a parent behavior prevents the move.
   * @throws If delegated block mutation, hierarchy, or list-property validation fails.
   */
  onSplit(context: BlockKeyboardContext, target: KeyboardSelectionTarget): BlockBehaviorOutcome {
    return splitBlock(context, target);
  }

  /**
   * Indents the supplied outline roots through the core command, nesting consecutive roots under their previous sibling.
   *
   * The caller dispatches parent and child policies before this standard behavior
   * runs. Ineligible ranges stay unchanged. Core removal eligibility and semantic
   * move permissions are checked before applying the requested group mutation;
   * no recursive subtree reads are needed for those permissions.
   *
   * @param context - First selected block context supplying the live editor commands.
   * @param ids - Identifiers to indent together; selected descendants of another selected root are excluded from preflight roots.
   * @returns Always handled, including no-ops for ineligible ranges or move-permission vetoes after parent/child policies defer.
   * @throws If hierarchy reads, registered move permissions or the delegated core command fail.
   */
  onIndent(context: BlockOutlineContext, ids: readonly string[]): BlockBehaviorOutcome {
    const { reactPanel } = context;
    if (!ids.length || ids.some((id) => !reactPanel.blocks.canRemove(id))) {
      return "handled";
    }
    const roots = this.getMoveRoots(reactPanel, ids);
    const first = roots[0];
    if (!first) {
      return "handled";
    }
    const parentId = reactPanel.blocks.getParentId(first) ?? null;
    const siblings =
      parentId === null ? reactPanel.blocks.getRootIds() : reactPanel.blocks.getChildIds(parentId);
    const previous = siblings[siblings.indexOf(first) - 1];
    if (!previous || !this.canMoveRoots(reactPanel, roots, { parentId: previous })) {
      return "handled";
    }
    reactPanel.blocks.indentBlocks([...ids]);
    return "handled";
  }

  /**
   * Outdents the supplied outline roots through the core command, lifting consecutive roots to their grandparent.
   *
   * The caller dispatches parent and child policies before this standard behavior
   * runs, so parent floor refusals stop before reaching this implementation. Root
   * blocks and other ineligible ranges stay unchanged. Semantic move permissions
   * preflight both the lifted roots and later siblings adopted by the last root
   * before either placement is mutated; batching remains owned by the caller.
   *
   * @param context - First selected block context supplying the live editor commands.
   * @param ids - Identifiers to outdent together; selected descendants of another selected root are excluded from preflight roots.
   * @returns Always handled, including root no-ops or permission vetoes; parent/child handlers run at the semantic entry point.
   * @throws If hierarchy reads, registered move permissions or the delegated core command fail.
   */
  onOutdent(context: BlockOutlineContext, ids: readonly string[]): BlockBehaviorOutcome {
    const { reactPanel } = context;
    if (!ids.length || ids.some((id) => !reactPanel.blocks.canOutdent(id))) {
      return "handled";
    }
    const roots = this.getMoveRoots(reactPanel, ids);
    const parentId = roots[0] ? reactPanel.blocks.getParentId(roots[0]) : null;
    if (parentId === null) {
      return "handled";
    }
    const destination = reactPanel.document.blocks.getInsertionDestinationAfter(parentId);
    const boundary = roots.findIndex(
      (id) => reactPanel.blocks.getParentId(id) === destination.parentId,
    );
    const moving = boundary < 0 ? roots : roots.slice(0, boundary);
    if (!moving.length || !this.canMoveRoots(reactPanel, moving, destination)) {
      return "handled";
    }
    const last = moving.at(-1)!;
    const siblings = reactPanel.blocks.getChildIds(reactPanel.blocks.getParentId(last)!);
    const tail = siblings.slice(siblings.indexOf(last) + 1);
    // Core outdent adopts later siblings before lifting; preflight both moves before any mutation.
    if (tail.length && !this.canMoveRoots(reactPanel, tail, { parentId: last })) {
      return "handled";
    }
    reactPanel.blocks.outdentBlocks([...ids]);
    return "handled";
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
    context: BlockKeyboardContext,
    target: KeyboardSelectionTarget,
  ): BlockBehaviorOutcome {
    if (!context.reactPanel.selection.isRenderedBlockNested(target.blockId)) {
      return "unhandled";
    }
    const { reactPanel } = context;
    const attachment = context.inputRoot ?? reactPanel.inputRoot;
    const outlineContext = createBlockOutlineContext(
      reactPanel,
      target.blockId,
      reactPanel.selection.get(),
    );
    if (outlineContext) {
      reactPanel.batchUpdates(() =>
        reactPanel.editor.blockBehaviors.dispatch("onOutdent", outlineContext, [target.blockId]),
      );
    }
    scheduleBlockFocus(reactPanel, target.blockId, 0, attachment, context.inputRegistration);
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
    context: BlockKeyboardContext,
    target: KeyboardSelectionTarget,
  ): BlockBehaviorOutcome {
    const { reactPanel, inputRoot } = context;
    const attachment = inputRoot ?? reactPanel.inputRoot;
    if (reactPanel.selection.isRenderedBlockNested(target.blockId)) {
      return "unhandled";
    }
    if (
      removeEmptyBlockAfterStructuralPredecessor(
        reactPanel,
        target.blockId,
        inputRoot,
        context.inputRegistration,
      )
    ) {
      return "handled";
    }
    const previous = reactPanel.selection.adjacentEditableBlockId(target.blockId, "previous");
    if (!previous) {
      return "unhandled";
    }
    const joinOffset = mergeBlocks(reactPanel, previous, target.blockId);
    scheduleBlockFocus(reactPanel, previous, joinOffset, attachment, context.inputRegistration);
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
    context: BlockKeyboardContext,
    target: KeyboardSelectionTarget,
  ): BlockBehaviorOutcome {
    const { reactPanel, block, inputRoot } = context;
    const attachment = inputRoot ?? reactPanel.inputRoot;
    // Forward Delete must not merge across a collapsed branch whose children are hidden from the caret.
    if (!reactPanel.editor.blockBehaviors.childrenVisible(block)) {
      return "unhandled";
    }
    if (
      removeEmptyBlockAfterStructuralPredecessor(
        reactPanel,
        block.id,
        inputRoot,
        context.inputRegistration,
      )
    ) {
      return "handled";
    }
    const next = reactPanel.selection.adjacentEditableBlockId(target.blockId, "next");
    if (!next) {
      return "unhandled";
    }
    const joinOffset = mergeBlocks(reactPanel, block.id, next);
    scheduleBlockFocus(reactPanel, block.id, joinOffset, attachment, context.inputRegistration);
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
    context: BlockKeyboardContext,
    target: KeyboardSelectionTarget,
  ): BlockBehaviorOutcome {
    const { reactPanel, block, inputRoot } = context;
    const attachment = inputRoot ?? reactPanel.inputRoot;
    if (block.content !== "") {
      return "unhandled";
    }
    const candidate = reactPanel.blocks.getBlockNode(block.id)!;
    const defaultWritingBlockFactory = reactPanel.editor.defaultWritingBlockFactory;
    if (defaultWritingBlockFactory.isEmptyBlock(candidate)) {
      return "unhandled";
    }
    if (reactPanel.selection.adjacentEditableBlockId(target.blockId, "previous")) {
      return "unhandled";
    }
    resetToWritingType(reactPanel, block.id);
    scheduleBlockFocus(reactPanel, block.id, 0, attachment, context.inputRegistration);
    return "handled";
  }

  /**
   * Generic blocks do not relocate children before a structural delete.
   *
   * @param context - Unused selected-block context.
   * @param ids - Unused structural selection.
   * @returns `"unhandled"` so the shared selection-deletion path proceeds.
   */
  onStructuralDelete(context: BlockSnapshotContext, ids: readonly string[]): BlockBehaviorOutcome {
    return "unhandled";
  }

  /**
   * Reads selected roots in document order, excluding descendants of another selected root.
   *
   * @param reactPanel - Panel owning the current tree.
   * @param ids - Selected identifiers, possibly unordered or including descendants.
   * @returns Existing top-level roots; single-block requests avoid an outline traversal.
   */
  private getMoveRoots(reactPanel: BlockOutlinePanel, ids: readonly string[]): string[] {
    if (ids.length <= 1) {
      return ids.filter((id) => reactPanel.blocks.getBlockNode(id));
    }
    const selected = new Set(ids);
    return reactPanel.blocks.getOrderedIds(ids).filter((id) => {
      if (!selected.has(id)) {
        return false;
      }
      let parent = reactPanel.blocks.getParentId(id);
      while (parent != null) {
        if (selected.has(parent)) {
          return false;
        }
        parent = reactPanel.blocks.getParentId(parent);
      }
      return true;
    });
  }

  /**
   * Checks move permissions using shallow source fields rather than recursive subtree reads.
   *
   * @param reactPanel - Panel owning semantic behavior checks.
   * @param ids - Existing moved-root identifiers.
   * @param destination - Core insertion position.
   * @returns Whether every root exists and all applicable behaviors allow the move.
   * @throws If a registered semantic move permission throws.
   */
  private canMoveRoots(
    reactPanel: BlockOutlinePanel,
    ids: readonly string[],
    destination: BlockDestination,
  ): boolean {
    const sources = ids.flatMap((id) => {
      const node = reactPanel.blocks.getBlockNode(id);
      return node ? [node] : [];
    });
    return (
      sources.length === ids.length &&
      reactPanel.editor.blockBehaviors.canMove({ sources, destination })
    );
  }
}

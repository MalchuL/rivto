import type { KeyboardSelectionTarget } from "../../../../managers/events/selection";
import type {
  BlockBehavior,
  BlockBehaviorAvailabilityContext,
  BlockBehaviorContext,
  BlockBehaviorOutcome,
} from "../../../../block-behaviors/types";
import { scheduleBlockFocus } from "../../../../block-behaviors/utils/focus-ops";
import { convertEmptyToList, splitBlock } from "../../../../block-behaviors/utils/text-ops";
import { DEFAULT_BLOCK_LIST_PROPS, isNumberedListType } from "./utils";

/** Ordinary list inheritance and root-marker restoration, excluding checkbox and numbered modes. */
export class ListBlockBehavior implements BlockBehavior {
  /**
   * Selects ordinary and absent markers, including other persisted values handled as ordinary list splits.
   *
   * @param context - Current detached block fields and runtime; availability does not depend on a particular method or native type.
   * @returns True unless checkbox or a numbered mode owns this marker.
   */
  isAvailable(context: BlockBehaviorAvailabilityContext): boolean {
    return (
      context.block.listProps.type !== "checkbox" &&
      !isNumberedListType(context.block.listProps.type)
    );
  }

  /**
   * Restores an empty root writing block's ordinary marker or performs an ordinary list split.
   *
   * Continuation uses fresh ordinary-list defaults with checkbox state reset;
   * other source list properties are not inherited. Shared Enter handling owns
   * outdenting, child placement, canvas range updates, and scheduled caret focus.
   *
   * @param context - Current block and view; the caller owns the transaction.
   * @param target - Captured caret or structural keyboard target for the split.
   * @returns Handled after a root marker transition, split, or outdent attempt.
   * @throws If delegated block mutation or list-property validation fails.
   */
  onSplit(context: BlockBehaviorContext, target: KeyboardSelectionTarget): BlockBehaviorOutcome {
    const { reactPanel, block, root } = context;
    if (
      !reactPanel.blocks.getParentId(block.id) &&
      reactPanel.editor.defaultWritingBlockFactory.isEmptyBlock(
        reactPanel.blocks.getBlockNode(block.id)!,
      ) &&
      block.listProps.type !== "list"
    ) {
      convertEmptyToList(reactPanel, block.id);
      scheduleBlockFocus(reactPanel, root, block.id, 0);
      return "handled";
    }
    return splitBlock(context, target, { ...DEFAULT_BLOCK_LIST_PROPS });
  }
}

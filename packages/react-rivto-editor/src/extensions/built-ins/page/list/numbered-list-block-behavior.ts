import type { KeyboardSelectionTarget } from "../../../../managers/events/selection";
import type {
  BlockBehavior,
  BlockBehaviorAvailabilityContext,
  BlockBehaviorContext,
  BlockBehaviorOutcome,
} from "../../../../block-behaviors/types";
import { splitBlock } from "../../../../block-behaviors/utils/text-ops";
import { focusCaret } from "../../../../block-behaviors/utils/focus-ops";
import { isNumberedListType } from "./utils";

/** Numbered-list inheritance and empty-marker transitions independent of native block type. */
export class NumberedListBlockBehavior implements BlockBehavior {
  /**
   * Selects the persisted numbered-list marker for this operation.
   *
   * @param context - Block whose behavior is checked, including explicit source/destination roles for drops.
   * @returns True only when this behavior owns this block's list mode.
   */
  isAvailable(context: BlockBehaviorAvailabilityContext): boolean {
    return isNumberedListType(context.block.listProps.type);
  }

  /**
   * Clears an empty numbered-list marker or splits with fresh continuation properties.
   *
   * Continuation inherits numbered-list mode and resets checked to false without
   * copying unrelated list properties. Shared Enter handling owns child placement,
   * canvas range updates, and scheduled caret focus. Empty writing blocks clear
   * their marker first and keep their outline position until the next Enter.
   *
   * @param context - Current block and view; the caller owns the transaction.
   * @param target - Captured caret or structural keyboard target for the split.
   * @returns Handled after removing the marker or completing the shared split.
   * @throws If delegated block mutation or list-property validation fails.
   */
  onSplit(context: BlockBehaviorContext, target: KeyboardSelectionTarget): BlockBehaviorOutcome {
    const { reactPanel, block, root } = context;
    if (
      !reactPanel.editor.defaultWritingBlockFactory.isEmptyBlock(
        reactPanel.blocks.getBlockNode(block.id)!,
      )
    ) {
      return splitBlock(context, target, { type: "numbered_list", checked: false });
    }
    // The first Enter removes only the visible list state; the block keeps
    // its outline position and unrelated properties for the next press.
    reactPanel.blocks.deleteListProps(block.id, ["type", "checked"]);
    focusCaret(reactPanel, root, block.id, 0);
    return "handled";
  }
}

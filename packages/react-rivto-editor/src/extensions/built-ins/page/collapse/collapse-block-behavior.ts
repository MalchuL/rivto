import type {
  BlockBehavior,
  BlockBehaviorAvailabilityContext,
  BlockBehaviorData,
} from "../../../../block-behaviors/types";

/** Hides collapsed children for rendering, navigation, and drag placement. */
export class CollapseBlockBehavior implements BlockBehavior {
  /**
   * Selects explicitly collapsed blocks using their current persisted properties.
   * @param context - Current detached block fields and runtime, without reading descendants or inspecting the called method.
   * @returns True only when the parent is explicitly collapsed.
   */
  isAvailable(context: BlockBehaviorAvailabilityContext): boolean {
    return context.block.listProps.collapsed === true;
  }

  /**
   * Reads persisted collapse state without changing the document.
   * @param block - Properties of the parent being rendered or traversed.
   * @returns False only when the parent is explicitly collapsed.
   */
  childrenVisible(block: BlockBehaviorData): boolean {
    return block.listProps.collapsed !== true;
  }
}

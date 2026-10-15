import type { BlockBehaviorAvailabilityContext } from "../../../block-behaviors/types";
/**
 * Bento board view: a flat grid whose tiles cannot Tab-indent or Tab-outdent.
 *
 * Enter on an empty board inserts the first tile. Nested containers inside a
 * tile keep their own views. Drag may relocate a tile onto the page, add a
 * sibling tile, or nest one tile inside another.
 *
 * @module
 */
import { ContainerBlockBehavior } from "../../../block-behaviors/container-block-behavior";

/** Persisted native type shared by Bento rendering and behavior applicability. */
export const BENTO_BLOCK_TYPE = "bento";

/**
 * Behavior registered for the `bento` block type.
 */
export class BentoBehavior extends ContainerBlockBehavior {
  /**
   * Selects this native container independently of the registration's owner.
   * @param context - Current block fields; the registry also supplies each moved source and receiving parent separately.
   * @returns True only for the BENTO_BLOCK_TYPE native type.
   */
  override isAvailable(context: BlockBehaviorAvailabilityContext): boolean {
    return context.block.type === BENTO_BLOCK_TYPE;
  }
}

/** Shared instance registered by {@link bentoExtension}. */
export const bentoBehavior = new BentoBehavior();

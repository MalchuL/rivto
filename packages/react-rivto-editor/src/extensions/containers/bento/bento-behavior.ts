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
import type { DropAxis } from "../../../block-behaviors/types";

/**
 * Behavior registered for the `bento` block type.
 */
export class BentoBehavior extends ContainerBlockBehavior {
  override readonly dropAxis: DropAxis = "grid";
}

/** Shared instance registered by {@link bentoExtension}. */
export const bentoBehavior = new BentoBehavior();

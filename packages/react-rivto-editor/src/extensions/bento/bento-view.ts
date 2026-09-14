/**
 * Bento board view: a flat grid whose tiles cannot Tab-indent or Tab-outdent.
 *
 * Enter on an empty board inserts the first tile. Nested containers inside a
 * tile keep their own views. Drag may relocate a tile onto the page or drop a
 * page block in as a new sibling tile; Shift+Tab still stops at this board.
 *
 * @module
 */
import { ContainerBlockView } from "../../views/container-view";
import type { DropAxis } from "../../views/types";

/**
 * Behavior registered for the `bento` block type.
 */
export class BentoView extends ContainerBlockView {
  override readonly dropAxis: DropAxis = "grid";
}

/** Shared instance registered by {@link bentoExtension}. */
export const bentoView = new BentoView();

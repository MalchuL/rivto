import { createStructuralSelection } from "@chulane/rivto";
import type { Canvas } from "@chulane/rivto-edgeless";
import type { ReactPanelApi } from "../../panels/types";
import {
  EDGELESS_ROOT_SELECTOR,
  EDGELESS_OBJECT_KIND_SELECTOR,
  EDGELESS_UI_SELECTOR,
  EDITOR_CONTROL_SELECTOR,
} from "../../constants";
import { registerBlockSurfaceDrop } from "../block-surface-drop";
import {
  EDGELESS_BLOCK_ELEMENT_TYPE,
  EDGELESS_CARD_DEFAULT_FRAME,
  insertBlockElementSeparator,
} from "../../elements/block-element-projection";

/** Document capabilities borrowed by one mounted canvas drop target. */
interface BlockCanvasDropPanel extends Pick<ReactPanelApi, "rootBlockId" | "batchUpdates"> {
  readonly blocks: Pick<
    ReactPanelApi["blocks"],
    | "canRemove"
    | "getBlock"
    | "getBlockNode"
    | "getRootIds"
    | "insertBlock"
    | "getInsertionDestinationAfter"
    | "moveBlocks"
  >;
  readonly elements: Pick<ReactPanelApi["elements"], "getElementNodes" | "insertElement">;
  readonly selection: Pick<ReactPanelApi["selection"], "set">;
  readonly editor: {
    readonly blockTypes: Pick<
      ReactPanelApi["editor"]["blockTypes"],
      "getDefaultBlockElementSeparatorType" | "separatesBlockElements"
    >;
    readonly blockBehaviors: Pick<ReactPanelApi["editor"]["blockBehaviors"], "canMove">;
  };
}

/**
 * Registers a canvas viewport to receive unclaimed block drag releases.
 *
 * The handler rejects hits on cards, canvas objects, UI and editor controls, as
 * well as empty, inaccessible or disallowed selections and bounded panels. It
 * also requires a current root and a registered block-element separator type.
 * For an accepted release, it converts client coordinates to canvas world
 * coordinates, moves the selected roots after a separator and inserts one block
 * element spanning them in a single panel batch. It then selects the moved roots
 * in their resulting document order. The existing blocks and subtrees are moved,
 * not copied.
 *
 * @param viewport - Mounted viewport used for hit registration and client-coordinate origin.
 * @param panel - Borrowed panel providing block checks, mutations and selection.
 * @param canvas - Borrowed surface canvas used to convert viewport coordinates to world coordinates.
 * @param width - Preferred card width in world units; non-finite or non-positive values use the default.
 * @returns Cleanup that removes the handler if it is still registered for this viewport.
 * @throws A later drop propagates failures from validation, geometry, document mutations or selection.
 */
export function registerBlockCanvasDrop(
  viewport: HTMLElement,
  panel: BlockCanvasDropPanel,
  canvas: Pick<Canvas, "toWorld">,
  width: number,
): () => void {
  return registerBlockSurfaceDrop(viewport, (ids, x, y, hit) => {
    // Reject hits inside a card, canvas object, edgeless UI or editor control.
    if (
      hit.closest(
        `${EDGELESS_ROOT_SELECTOR}, ${EDGELESS_OBJECT_KIND_SELECTOR}, ${EDGELESS_UI_SELECTOR}, ${EDITOR_CONTROL_SELECTOR}`,
      )
    ) {
      return false;
    }
    // Reject the complete selection if any source cannot leave this panel.
    if (
      !ids.length ||
      panel.rootBlockId !== undefined ||
      ids.some((id) => !panel.blocks.canRemove(id))
    ) {
      return false;
    }
    const blocks = ids.flatMap((id) => panel.blocks.getBlock(id) ?? []);
    const roots = panel.blocks.getRootIds();
    const last = roots.at(-1);
    if (
      blocks.length !== ids.length ||
      !last ||
      !panel.editor.blockTypes.getDefaultBlockElementSeparatorType()
    ) {
      return false;
    }
    if (
      !panel.editor.blockBehaviors.canMove({ sources: blocks, destination: { parentId: null } })
    ) {
      return false;
    }
    const rect = viewport.getBoundingClientRect();
    const point = canvas.toWorld({ x: x - rect.left, y: y - rect.top });
    const zIndex =
      Math.max(0, ...panel.elements.getElementNodes().map((element) => element.zIndex)) + 1;
    let movedIds: readonly string[] = [];
    panel.batchUpdates(() => {
      // A separator keeps the new card's roots separate from the preceding card.
      const lastBlock = panel.blocks.getBlockNode(last);
      const separator =
        lastBlock && panel.editor.blockTypes.separatesBlockElements(lastBlock.type)
          ? last
          : insertBlockElementSeparator(panel, last).id;
      panel.blocks.moveBlocks(ids, separator, "after");
      // Grouped moves use document order, which can differ from selection order.
      const selected = new Set(ids);
      movedIds = panel.blocks.getRootIds().filter((id) => selected.has(id));
      panel.elements.insertElement({
        type: EDGELESS_BLOCK_ELEMENT_TYPE,
        frame: {
          ...EDGELESS_CARD_DEFAULT_FRAME,
          ...point,
          width: Number.isFinite(width) && width > 0 ? width : EDGELESS_CARD_DEFAULT_FRAME.width,
        },
        zIndex,
        props: { startBlockId: movedIds[0], endBlockId: movedIds[movedIds.length - 1] },
      });
    });
    panel.selection.set(createStructuralSelection(movedIds));
    return true;
  });
}

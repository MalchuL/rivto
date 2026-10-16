import { blockMoveDestination } from "../placement/utils";
import { PanelDOM, isInPanel } from "../../../managers/events/panel-dom";
/** Measures one active surface and resolves its explicit drop regions. */
import type { EditorBlock } from "@chulane/rivto";
import type { ReactPanelApi } from "../../../panels/types";
import {
  resolveDropPlacement,
  type DropLayoutBlock,
  type DropLayoutOptions,
} from "../placement/resolver";
import type { DropBlock } from "../placement/types";
import { resolveBeforeDropPlacement, resolveSiblingAfterDropPlacement } from "../placement/utils";
import type { DropPlacement, PointerCoordinates } from "../types";
import { getBlockDragOptions } from "../block-drag-options";

/**
 * Returns the tree displayed by this view without changing document operations.
 *
 * @param reactPanel - Destination view, optionally scoped to one subtree.
 * @returns The displayed subtree, the complete forest for a document view,
 * or an empty list when the scoped root has been deleted.
 */
export function getDropBlocks(reactPanel: ReactPanelApi): EditorBlock[] {
  return reactPanel.blocks.getBlocks();
}

/**
 * Collects only rendered blocks belonging to this surface. Keeps the complete
 * identity list, but reads bounding rectangles only when the resolver accesses
 * them. Each access reads the live DOM; no geometry survives between calculations.
 *
 * @param root - Surface element containing the rendered destination blocks.
 * @param reactPanel - Destination React view providing semantic move permissions and extension geometry annotations.
 * @returns Rendered block identities and layout policies with live viewport
 * rectangle getters; blocks without a direct page row or client rectangles are omitted.
 */
export function collectDropLayout(root: HTMLElement, reactPanel: ReactPanelApi): DropLayoutBlock[] {
  const dom = new PanelDOM(root);
  return dom.getBlocks().flatMap((element) => {
    const id = element.dataset.blockId;
    const row = dom.getRow(element);
    if (!id || !row || !element.getClientRects().length) {
      return [];
    }
    const parent = dom.getParent(element);
    const type = reactPanel.blocks.getBlockNode(id)?.type;
    const dragOptions =
      (type && getBlockDragOptions(reactPanel.editor.blockTypes.getDefinition(type)?.metadata)) ||
      {};
    return [
      {
        id,
        parentId: parent && root.contains(parent) ? (parent.dataset.blockId ?? null) : null,
        get row() {
          return row.getBoundingClientRect();
        },
        get rect() {
          return element.getBoundingClientRect();
        },
        axis: dragOptions.dropAxis,
        fixed: dragOptions.fixed === true,
        acceptsBody: Boolean(dragOptions.acceptsDropContainer),
        options: dragOptions.dropPlacement,
        hasRenderedChildren: Boolean(
          element.querySelector(":scope > .page-block-children > [data-block-id]"),
        ),
      },
    ];
  });
}

/**
 * Resolves a surface drop using the shared local, foreign-document, and keyboard
 * geometry adapter.
 *
 * Collects rendered layout and validates candidate destinations through the
 * destination view's block behaviors. Pointer drops in canvas cards use the card
 * under the pointer, so overlapping cards cannot supply hidden destinations.
 * The supplied tree determines which blocks can participate, allowing local
 * callers to exclude the subtrees being moved. Card-edge gaps retain document
 * neighbors outside the card so the final move validates against that tree.
 *
 * @param root - Destination surface element, or `null` when unavailable.
 * @param reactPanel - Destination React view providing layout and acceptance behavior.
 * @param sources - Source blocks checked against each candidate destination.
 * @param blocks - Destination tree participating in placement resolution.
 * @param pointer - Pointer or keyboard-generated position in viewport pixels.
 * @param options - Placement defaults and optional keyboard policy.
 * @returns Accepted placement with indicator data, or `null` when the surface
 * is unavailable or no eligible region resolves to an accepted destination.
 */
export function resolveSurfaceDrop(
  root: HTMLElement | null,
  reactPanel: ReactPanelApi,
  sources: readonly EditorBlock[],
  blocks: readonly DropBlock[],
  pointer: PointerCoordinates,
  options: DropLayoutOptions,
): DropPlacement | null {
  if (!root) {
    return null;
  }
  // Canvas cards may overlap. Hit-testing selects the visible owning layout;
  // resolving all cards together can choose a hidden block from another card.
  const card = !options.keyboard
    ? root.ownerDocument
        ?.elementFromPoint(pointer.x, pointer.y)
        ?.closest<HTMLElement>("[data-edgeless-card-content]")
    : null;
  // Blank canvas has no outline destination; only the card under the pointer
  // contributes blocks. Keyboard movement still uses its supplied geometry.
  if (!options.keyboard && root.getAttribute?.("data-rivto-surface") === "edgeless" && !card) {
    return null;
  }
  const layoutRoot = card && root.contains(card) && isInPanel(root, card) ? card : root;
  const measured = collectDropLayout(layoutRoot, reactPanel);
  const panelRoot =
    reactPanel.rootBlockId &&
    !reactPanel.blocks.hasBlock(reactPanel.rootBlockId) &&
    reactPanel.document.blocks.hasBlock(reactPanel.rootBlockId)
      ? reactPanel.rootBlockId
      : undefined;
  const placement = resolveDropPlacement(
    measured,
    blocks,
    pointer,
    options,
    (destination) =>
      (!reactPanel.rootBlockId || Boolean(panelRoot) || destination.parentId !== null) &&
      reactPanel.editor.blockBehaviors.canMove({
        sources,
        destination: blockMoveDestination(
          panelRoot && destination.parentId === null
            ? { ...destination, parentId: panelRoot }
            : destination,
        ),
      }),
  );
  if (placement?.kind !== "between") {
    return placement;
  }
  // A card boundary is a document gap, not necessarily the document's edge.
  // Keep the visible indicator, but include hidden separators or other cards
  // in its canonical neighbors for the final adjacency check.
  // Filtered containers likewise need their hidden siblings in the stored gap.
  let destination;
  if (placement.nextId) {
    destination = resolveBeforeDropPlacement(blocks, placement.nextId);
  } else if (placement.previousId) {
    destination = resolveSiblingAfterDropPlacement(blocks, placement.previousId);
  }
  const resolved = destination ? { ...placement, ...destination } : placement;
  return panelRoot && resolved.parentId === null ? { ...resolved, parentId: panelRoot } : resolved;
}

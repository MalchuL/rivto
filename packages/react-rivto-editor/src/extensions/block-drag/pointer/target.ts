import { findViewElements, isInDocumentView } from "../../../managers/events/document-view";
/** Measures one active surface and resolves its explicit drop regions. */
import type { EditorBlock } from "@chulane/rivto";
import type { ReactEditor } from "../../../types";
import { blockContainment } from "../utils/containment";
import { resolveDropPlacement, type DropLayoutBlock, type DropLayoutOptions } from "../placement/resolver";
import type { DropBlock } from "../placement/types";
import { resolveBeforeDropPlacement, resolveSiblingAfterDropPlacement } from "../placement/utils";
import type { DropPlacement, PointerCoordinates } from "../types";

/**
 * Returns the tree displayed by this view without changing document operations.
 *
 * @param runtime - Destination runtime, optionally scoped to one subtree.
 * @returns The displayed subtree, the complete forest for a document view,
 * or an empty list when the scoped root has been deleted.
 */
export function getDropBlocks(runtime: ReactEditor): EditorBlock[] {
  if (!runtime.rootBlockId) return runtime.blocks.getBlocks();
  const root = runtime.blocks.getBlock(runtime.rootBlockId);
  return root ? [root] : [];
}

/**
 * Collects only rendered blocks belonging to this surface. Keeps the complete
 * identity list, but reads bounding rectangles only when the resolver accesses
 * them. Each access reads the live DOM; no geometry survives between calculations.
 *
 * @param root - Surface element containing the rendered destination blocks.
 * @param runtime - Destination React runtime providing block-view behavior and containment.
 * @returns Rendered block identities and layout policies with live viewport
 * rectangle getters; blocks without a direct page row or client rectangles are omitted.
 */
export function collectDropLayout(root: HTMLElement, runtime: ReactEditor): DropLayoutBlock[] {
  return findViewElements(root, "[data-block-id]").flatMap((element) => {
    const id = element.dataset.blockId;
    const row = element.querySelector<HTMLElement>(":scope > .page-block-row");
    if (!id || !row || !element.getClientRects().length) return [];
    const parent = element.parentElement?.closest<HTMLElement>("[data-block-id]");
    const view = runtime.views.resolve(id);
    return [{
      id, parentId: parent && root.contains(parent) ? parent.dataset.blockId ?? null : null,
      get row() { return row.getBoundingClientRect(); },
      get rect() { return element.getBoundingClientRect(); },
      axis: view.dropAxis, fixed: blockContainment(runtime, id)?.childOutline === "fixed",
      acceptsBody: Boolean(view.acceptsDropContainer), options: view.dropPlacement,
      hasRenderedChildren: Boolean(element.querySelector(":scope > .page-block-children > [data-block-id]")),
    }];
  });
}

/**
 * Resolves a surface drop using the shared local, foreign-document, and keyboard
 * geometry adapter.
 *
 * Collects rendered layout and validates candidate destinations through the
 * destination runtime's views. Pointer drops in canvas cards use the card
 * under the pointer, so overlapping cards cannot supply hidden destinations.
 * The supplied tree determines which blocks can participate, allowing local
 * callers to exclude the subtrees being moved. Card-edge gaps retain document
 * neighbors outside the card so the final move validates against that tree.
 *
 * @param root - Destination surface element, or `null` when unavailable.
 * @param runtime - Destination React runtime providing layout and acceptance behavior.
 * @param sources - Source blocks checked against each candidate destination.
 * @param blocks - Destination tree participating in placement resolution.
 * @param pointer - Pointer or keyboard-generated position in viewport pixels.
 * @param options - Placement defaults and optional keyboard policy.
 * @returns Accepted placement with indicator data, or `null` when the surface
 * is unavailable or no eligible region resolves to an accepted destination.
 */
export function resolveSurfaceDrop(
  root: HTMLElement | null,
  runtime: ReactEditor,
  sources: readonly EditorBlock[],
  blocks: readonly DropBlock[],
  pointer: PointerCoordinates,
  options: DropLayoutOptions,
): DropPlacement | null {
  if (!root) return null;
  // Canvas cards may overlap. Hit-testing selects the visible owning layout;
  // resolving all cards together can choose a hidden block from another card.
  const card = !options.keyboard ? root.ownerDocument?.elementFromPoint(pointer.x, pointer.y)
    ?.closest<HTMLElement>("[data-edgeless-card-content]") : null;
  // Blank canvas has no outline destination; only the card under the pointer
  // contributes blocks. Keyboard movement still uses its supplied geometry.
  if (!options.keyboard && root.getAttribute?.("data-rivto-surface") === "edgeless" && !card) return null;
  const layoutRoot = card && root.contains(card) && isInDocumentView(root, card) ? card : root;
  const measured = collectDropLayout(layoutRoot, runtime);
  const placement = resolveDropPlacement(measured, blocks, pointer, options,
    (destination) => (!runtime.rootBlockId || destination.parentId !== null)
      && runtime.views.acceptsDrop(destination, sources));
  if (placement?.kind !== "between") return placement;
  // A card boundary is a document gap, not necessarily the document's edge.
  // Keep the visible indicator, but include hidden separators or other cards
  // in its canonical neighbors for the final adjacency check.
  // Filtered containers likewise need their hidden siblings in the stored gap.
  let destination;
  if (placement.nextId) destination = resolveBeforeDropPlacement(blocks, placement.nextId);
  else if (placement.previousId) destination = resolveSiblingAfterDropPlacement(blocks, placement.previousId);
  return destination ? { ...placement, ...destination } : placement;
}

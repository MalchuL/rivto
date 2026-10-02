/** Measures one active surface and resolves its explicit drop regions. */
import type { EditorBlock } from "@chulane/rivto";
import type { ReactEditor } from "../../../types";
import { blockContainment } from "../utils/containment";
import { resolveDropPlacement, type DropLayoutBlock, type DropLayoutOptions } from "../placement/resolver";
import type { DropBlock } from "../placement/types";
import type { DropPlacement, PointerCoordinates } from "../types";

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
  return [...root.querySelectorAll<HTMLElement>("[data-block-id]")].flatMap((element) => {
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
      hasRenderedChildren: Boolean(element.querySelector("[data-block-id]")),
    }];
  });
}

/**
 * Resolves a surface drop using the shared local, foreign-document, and keyboard
 * geometry adapter.
 *
 * Collects rendered layout and validates candidate destinations through the
 * destination runtime's views. The supplied tree determines which blocks can
 * participate, allowing local callers to exclude the subtrees being moved.
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
  const measured = collectDropLayout(root, runtime);
  return resolveDropPlacement(measured, blocks, pointer, options,
    (destination) => runtime.views.acceptsDrop(destination, sources));
}

/** Measures one active surface and resolves its explicit drop regions. */
import type { EditorBlock } from "@chulane/rivto";
import type { ReactEditor } from "../../../types";
import { blockContainment } from "../utils/containment";
import { resolveDropPlacement, type DropLayoutBlock, type DropLayoutOptions } from "../placement/resolver";
import type { DropBlock } from "../placement/types";
import type { DropPlacement, PointerCoordinates } from "../types";

/** Collects only rendered blocks belonging to this surface. */
export function collectDropLayout(root: HTMLElement, runtime: ReactEditor): DropLayoutBlock[] {
  return [...root.querySelectorAll<HTMLElement>("[data-block-id]")].flatMap((element) => {
    const id = element.dataset.blockId;
    const row = element.querySelector<HTMLElement>(":scope > .page-block-row");
    if (!id || !row || !element.getClientRects().length) return [];
    const parent = element.parentElement?.closest<HTMLElement>("[data-block-id]");
    const view = runtime.views.resolve(id);
    return [{
      id, parentId: parent && root.contains(parent) ? parent.dataset.blockId ?? null : null,
      row: row.getBoundingClientRect(), rect: element.getBoundingClientRect(),
      axis: view.dropAxis, fixed: blockContainment(runtime, id)?.childOutline === "fixed",
      acceptsBody: Boolean(view.acceptsDropContainer), options: view.dropPlacement,
      hasRenderedChildren: Boolean(element.querySelector("[data-block-id]")),
    }];
  });
}

/** Shared local, foreign-document, and keyboard geometry adapter. */
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

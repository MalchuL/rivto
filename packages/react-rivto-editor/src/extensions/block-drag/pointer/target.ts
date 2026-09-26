/**
 * Native DOM target collection for page pointer drag gestures.
 *
 * Pointer dragging never relies on library collision detection: Rivto
 * hit-tests block rows itself and adapts the winning block into a
 * library-independent {@link DropPlacementInput} for the placement resolver.
 *
 * @module
 */
import type { ReactEditor } from "../../../types";
import { blockContainment } from "../utils/containment";
import {
  NEARBY_ROW_DROP_PX,
  pickPointerDropTarget,
  type PointerDropCandidate,
  type PointerDropReason,
} from "./hit";
import type { DropPlacementInput, DropPlacementSource } from "../placement/types";
import type { PointerCoordinates } from "../types";

const PAGE_BLOCK_ROW_CLASS = "page-block-row";
const PAGE_BLOCK_SELECTOR = "[data-block-id]";

/**
 * Collects ancestor block IDs from a block element outward to the surface root.
 *
 * @param element - Block whose parents are walked.
 * @param root - Active editor surface that bounds the walk.
 * @returns Parent IDs from the closest ancestor outward.
 */
function ancestorBlockIds(element: HTMLElement, root: HTMLElement): string[] {
  const ids: string[] = [];
  let parent = element.parentElement?.closest<HTMLElement>(PAGE_BLOCK_SELECTOR);
  while (parent && root.contains(parent)) {
    const id = parent.dataset.blockId;
    if (id) ids.push(id);
    parent = parent.parentElement?.closest<HTMLElement>(PAGE_BLOCK_SELECTOR);
  }
  return ids;
}

/**
 * Measures every block row on the surface for gap and empty-lane targeting.
 *
 * Each candidate keeps both the title-row rect (nearest-block / inside-on-the-
 * same-line) and the full BlockView rect (empty accepting layout fields).
 * Ancestor IDs let a gap between children win over "inside parent container".
 *
 * @param root - Active editor surface containing eligible block rows.
 * @param reactEditor - Runtime used to resolve views and canonical containment.
 * @returns Candidates consumed by {@link pickPointerDropTarget}.
 */
function collectPointerDropCandidates(
  root: HTMLElement,
  reactEditor: ReactEditor,
): { readonly elements: Map<string, HTMLElement>; readonly candidates: PointerDropCandidate[] } {
  const elements = new Map<string, HTMLElement>();
  const candidates: PointerDropCandidate[] = [];
  root.querySelectorAll<HTMLElement>(PAGE_BLOCK_SELECTOR).forEach((element) => {
    const id = element.dataset.blockId;
    const row = element.querySelector<HTMLElement>(`:scope > .${PAGE_BLOCK_ROW_CLASS}`);
    if (!id || !row) return;
    elements.set(id, element);
    const view = reactEditor.views.resolve(id);
    candidates.push({
      id,
      row: row.getBoundingClientRect(),
      block: element.getBoundingClientRect(),
      acceptsDropContainer: Boolean(view.acceptsDropContainer),
      ancestorIds: ancestorBlockIds(element, root),
      dropAxis: view.dropAxis,
      childOutline: blockContainment(reactEditor, id)?.childOutline,
    });
  });
  return { elements, candidates };
}

/**
 * Builds the placement input for one resolved drop block.
 *
 * The target rectangle is what `resolveDropPlacement` treats as the row body
 * versus its before/after edges. A BlockView includes its whole subtree, so
 * free-outline targets use only their title row. Explicit body hits and fixed
 * layouts keep the full BlockView for containment or spatial half-splits.
 *
 * @param source - Dragged block identity, layout data, and cursor stand-in.
 * @param blockElement - BlockView that owns the resolved target.
 * @param useFullBlock - Whether the complete block, not just its row, is the target rect.
 * @param reactEditor - Runtime used to resolve views and canonical containment.
 * @param hitReason - Why this block was chosen; chrome titles skip inside-append.
 * @returns Input carrying the one live DOM target, or null when the row is missing.
 */
function pointerDropInput(
  source: DropPlacementSource,
  blockElement: HTMLElement,
  useFullBlock: boolean,
  reactEditor: ReactEditor,
  hitReason: PointerDropReason,
): DropPlacementInput | null {
  const id = blockElement.dataset.blockId;
  const row = blockElement.querySelector<HTMLElement>(`:scope > .${PAGE_BLOCK_ROW_CLASS}`);
  if (!id || !row) return null;
  const parentId = blockElement.parentElement?.closest<HTMLElement>(PAGE_BLOCK_SELECTOR)?.dataset.blockId;
  const targetView = reactEditor.views.resolve(id);
  const parentView = parentId ? reactEditor.views.resolve(parentId) : undefined;
  const parentOutline = parentId ? blockContainment(reactEditor, parentId)?.childOutline : undefined;
  const axis = parentOutline === "fixed" ? parentView?.dropAxis : undefined;
  const sortable = axis === "vertical" || axis === "horizontal" || axis === "grid";
  const dropNode = useFullBlock || sortable ? blockElement : row;
  return {
    source,
    target: {
      id,
      rect: dropNode.getBoundingClientRect(),
      data: {
        sortChildren: axis,
        hitReason,
        targetAcceptsDrop: Boolean(targetView.acceptsDropContainer),
        parentChildOutline: parentOutline,
        targetDropPlacement: targetView.dropPlacement,
        parentDropPlacement: parentView?.dropPlacement,
      },
    },
  };
}

/**
 * Resolves the block beneath the pointer through native hit testing.
 *
 * Gaps used to snap to the nearest accepting ancestor by
 * distance to that container's center. The pointer was not over the board;
 * the board was merely the closest `acceptsDropContainer` on the page, and
 * its tall BlockView then resolved as "inside". The same miss happened when
 * `elementsFromPoint` hit a parent's children wrapper: the parent rect
 * contains the gap between siblings, so the smallest containing block was
 * the container itself.
 *
 * Shared pointer hit-testing gives a block's outer edge priority over nested
 * rows, then resolves row and empty-body hits from the same measured geometry.
 *
 * @param source - Dragged block identity and layout data.
 * @param pointer - Live viewport cursor position driving the hit test.
 * @param root - Active editor surface containing eligible block rows.
 * @param reactEditor - Runtime used to resolve views and canonical containment.
 * @param excludedIds - Dragged subtree IDs that cannot become targets.
 * @returns Input carrying the one live DOM target, or null over blank space.
 */
export function withPointerDropTarget(
  source: DropPlacementSource,
  pointer: PointerCoordinates,
  root: HTMLElement | null,
  reactEditor: ReactEditor,
  excludedIds: ReadonlySet<string>,
): DropPlacementInput | null {
  if (!root) return null;

  // The same picker must handle row hits and gaps so a descendant row cannot
  // steal the narrow sibling zone at its parent's outer edge.
  const { elements, candidates } = collectPointerDropCandidates(root, reactEditor);
  const hit = pickPointerDropTarget(
    candidates.filter(({ id }) => !excludedIds.has(id)),
    pointer,
    NEARBY_ROW_DROP_PX,
  );
  const blockElement = hit ? elements.get(hit.id) : undefined;
  return blockElement
    ? pointerDropInput(source, blockElement, hit?.reason === "container", reactEditor, hit!.reason)
    : null;
}

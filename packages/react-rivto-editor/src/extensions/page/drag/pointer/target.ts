/** Native DOM target collection for page pointer drag gestures. */
import type { DragMoveEvent } from "@dnd-kit/core";
import type { ReactEditor } from "../../../../types";
import { blockContainment } from "../utils/containment";
import {
  NEARBY_ROW_DROP_PX,
  pickPointerDropTarget,
  type PointerDropCandidate,
  type PointerDropReason,
} from "./hit";
import { isStructuralLayout } from "../placement/intent";
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
 * same-line) and the full BlockView rect (empty kanban/table/column bodies).
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
 * Builds the dnd-kit movement event for one resolved drop block.
 *
 * The over rectangle is what `resolveDropPlacement` treats as the row body
 * versus its before/after edges. A kanban or table BlockView includes every
 * child, so feeding that huge rect made a pointer in a sibling gap look like
 * "inside" the board. Outline hits therefore use the title row. Empty-lane
 * hits (`useFullBlock`) keep the full BlockView so the lane body stays an
 * inside target. Sortable cards still use the complete card for half-splits.
 *
 * @param event - Current drag movement used for source data.
 * @param blockElement - BlockView that owns the resolved target.
 * @param useFullBlock - Whether the complete block, not just its row, is the over rect.
 * @param reactEditor - Runtime used to resolve views and canonical containment.
 * @param hitReason - Why this block was chosen; chrome titles skip inside-append.
 * @returns Event carrying the one live DOM target, or null when the row is missing.
 */
function pointerDropEvent(
  event: DragMoveEvent,
  blockElement: HTMLElement,
  useFullBlock: boolean,
  reactEditor: ReactEditor,
  hitReason: PointerDropReason,
): DragMoveEvent | null {
  const id = blockElement.dataset.blockId;
  const row = blockElement.querySelector<HTMLElement>(`:scope > .${PAGE_BLOCK_ROW_CLASS}`);
  if (!id || !row) return null;
  const parentId = blockElement.parentElement?.closest<HTMLElement>(PAGE_BLOCK_SELECTOR)?.dataset.blockId;
  const targetView = reactEditor.views.resolve(id);
  const parentView = parentId ? reactEditor.views.resolve(parentId) : undefined;
  const axis = parentView?.dropAxis;
  const sortable = axis === "vertical" || axis === "horizontal" || axis === "grid";
  const dropNode = useFullBlock || sortable ? blockElement : row;
  return {
    ...event,
    over: {
      id,
      rect: dropNode.getBoundingClientRect(),
      disabled: false,
      data: { current: {
        sortChildren: axis,
        hitReason,
        targetAcceptsDrop: Boolean(targetView.acceptsDropContainer),
        parentChildOutline: parentId ? blockContainment(reactEditor, parentId)?.childOutline : undefined,
        targetDropPlacement: targetView.dropPlacement,
        parentDropPlacement: parentView?.dropPlacement,
      } },
    },
  } as DragMoveEvent;
}

/**
 * Resolves the block beneath the pointer through native hit testing.
 *
 * Gaps used to snap to the nearest drop container (kanban, table, lane) by
 * distance to that container's center. The pointer was not over the board;
 * the board was merely the closest `acceptsDropContainer` on the page, and
 * its tall BlockView then resolved as "inside". The same miss happened when
 * `elementsFromPoint` hit a parent's children wrapper: the parent rect
 * contains the gap between siblings, so the smallest containing block was
 * the container itself.
 *
 * The fix hit-tests `.page-block-row` instead of the full BlockView.
 * A pointer on a row targets that block so "inside" stays on the same line.
 * A pointer in a gap falls through to {@link pickPointerDropTarget}, which
 * prefers the nearest row (before/after, including first/last nested
 * children) and only keeps a container when the pointer is over an empty
 * lane body with no nearby descendant row.
 *
 * @param event - Current drag movement used for source data.
 * @param pointer - Live viewport cursor position driving the hit test.
 * @param root - Active editor surface containing eligible block rows.
 * @param reactEditor - Runtime used to resolve views and canonical containment.
 * @param excludedIds - Dragged subtree IDs that cannot become targets.
 * @returns Event carrying the one live DOM target, or null over blank space.
 */
export function withPointerDropTarget(
  event: DragMoveEvent,
  pointer: PointerCoordinates,
  root: HTMLElement | null,
  reactEditor: ReactEditor,
  excludedIds: ReadonlySet<string>,
): DragMoveEvent | null {
  if (!root) return null;

  // Ignore the full BlockView: a parent kanban/table includes `.page-block-children`,
  // so a gap between siblings still sits inside the parent rect. Only a row
  // under the cursor is an "inside" hit; otherwise the gap picker runs.
  const hovered = new Set<HTMLElement>();
  root.ownerDocument.elementsFromPoint(pointer.x, pointer.y).forEach((element) => {
    let block = element.closest<HTMLElement>(PAGE_BLOCK_SELECTOR);
    while (block && root.contains(block)) {
      hovered.add(block);
      block = block.parentElement?.closest<HTMLElement>(PAGE_BLOCK_SELECTOR) ?? null;
    }
  });
  const rowHit = [...hovered].flatMap((element) => {
    if (element.dataset.blockId && excludedIds.has(element.dataset.blockId)) return [];
    const row = element.querySelector<HTMLElement>(`:scope > .${PAGE_BLOCK_ROW_CLASS}`);
    return row ? [{ element, row, rect: row.getBoundingClientRect() }] : [];
  }).filter(({ rect }) => (
    pointer.x >= rect.left && pointer.x <= rect.right
    && pointer.y >= rect.top && pointer.y <= rect.bottom
  )).sort((left, right) => (
    left.rect.width * left.rect.height - right.rect.width * right.rect.height
  ))[0];
  if (rowHit) {
    const id = rowHit.element.dataset.blockId;
    const view = id ? reactEditor.views.resolve(id) : undefined;
    const reason: PointerDropReason = view && isStructuralLayout({
      dropAxis: view.dropAxis,
      childOutline: id ? blockContainment(reactEditor, id)?.childOutline : undefined,
    }) ? "chrome" : "row";
    return pointerDropEvent(event, rowHit.element, false, reactEditor, reason);
  }

  // No row under the cursor: pick the nearest sibling row, not the nearest
  // board. Filled layout shells snap to a descendant field so the strip under
  // a kanban title does not become a new column. `reason === "container"` is
  // reserved for empty lanes.
  const { elements, candidates } = collectPointerDropCandidates(root, reactEditor);
  const hit = pickPointerDropTarget(
    candidates.filter(({ id }) => !excludedIds.has(id)),
    pointer,
    NEARBY_ROW_DROP_PX,
  );
  const blockElement = hit ? elements.get(hit.id) : undefined;
  return blockElement
    ? pointerDropEvent(event, blockElement, hit?.reason === "container", reactEditor, hit!.reason)
    : null;
}

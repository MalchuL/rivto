/** Registry of mounted document surfaces eligible for drops from another view. */
import type {
  CrossDocumentPageRootController,
  PointerCoordinates,
} from "../types";

export type { CrossDocumentPageRootController } from "../types";

/** Attribute marking a document surface as a drop destination for another view. */
export const CROSS_DOCUMENT_PAGE_ROOT_ATTRIBUTE = "data-rivto-cross-document-page-root";
const CROSS_DOCUMENT_PAGE_ROOT_SELECTOR = `[${CROSS_DOCUMENT_PAGE_ROOT_ATTRIBUTE}]`;

/** Mounted document surfaces in this JavaScript realm; weak keys avoid retaining DOM. */
export const crossDocumentPageRootControllers = new WeakMap<HTMLElement, CrossDocumentPageRootController>();

/**
 * Finds the closest registered document surface beneath the active pointer.
 * Nested views remain eligible even inside the source surface's rectangle.
 * Their top and bottom edge zones, including padding outside a displayed
 * subtree, belong to the enclosing surface so blocks can be placed before or
 * after the embedded view instead of inside its source.
 *
 * @param sourceRoot - Surface that owns the current gesture.
 * @param pointer - Current viewport pointer.
 * @param outerEdgeDropZone - Viewport pixels reserved for sibling placement at nested content edges; defaults to 8 and caps at one third of the content height.
 * @returns Destination controller, or null outside another registered surface.
 */
export function findCrossDocumentPageController(
  sourceRoot: HTMLElement | null,
  pointer: PointerCoordinates,
  outerEdgeDropZone = 8,
): CrossDocumentPageRootController | null {
  const document = sourceRoot?.ownerDocument;
  let pageRoot = document?.elementFromPoint(pointer.x, pointer.y)
    ?.closest<HTMLElement>(CROSS_DOCUMENT_PAGE_ROOT_SELECTOR);
  // Nested editors own their interior, while the enclosing view owns sibling
  // drops at their edges. Hit-testing only the nearest surface steals those drops.
  while (pageRoot) {
    const parent = pageRoot.parentElement?.closest<HTMLElement>(CROSS_DOCUMENT_PAGE_ROOT_SELECTOR);
    if (!parent) break;
    // A subtree view's padding is outside its displayed block. Measuring the
    // whole surface leaves that padding targeting the embedded document.
    const subtree = crossDocumentPageRootControllers.get(pageRoot)?.reactEditor.rootBlockId
      ? pageRoot.querySelector<HTMLElement>(":scope > [data-block-id]") : null;
    const rect = (subtree ?? pageRoot).getBoundingClientRect();
    const edge = Math.min(Math.max(0, outerEdgeDropZone), rect.height / 3);
    if (pointer.y > rect.top + edge && pointer.y < rect.bottom - edge) break;
    pageRoot = parent;
  }
  return pageRoot && pageRoot !== sourceRoot
    ? crossDocumentPageRootControllers.get(pageRoot) ?? null
    : null;
}

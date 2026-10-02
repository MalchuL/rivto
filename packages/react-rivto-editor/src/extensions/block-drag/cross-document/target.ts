/** Registry of mounted page surfaces eligible for cross-document block drops. */
import type {
  CrossDocumentPageRootController,
  PointerCoordinates,
} from "../types";

export type { CrossDocumentPageRootController } from "../types";

/** Attribute marking a page surface as a cross-document drop destination. */
export const CROSS_DOCUMENT_PAGE_ROOT_ATTRIBUTE = "data-rivto-cross-document-page-root";
const CROSS_DOCUMENT_PAGE_ROOT_SELECTOR = `[${CROSS_DOCUMENT_PAGE_ROOT_ATTRIBUTE}]`;

/** Mounted page surfaces in this JavaScript realm; weak keys avoid retaining DOM. */
export const crossDocumentPageRootControllers = new WeakMap<HTMLElement, CrossDocumentPageRootController>();

/**
 * Finds another registered page surface beneath the active pointer.
 *
 * @param sourceRoot - Surface that owns the current gesture.
 * @param pointer - Current viewport pointer.
 * @returns Destination controller, or null outside another page.
 */
export function findCrossDocumentPageController(
  sourceRoot: HTMLElement | null,
  pointer: PointerCoordinates,
): CrossDocumentPageRootController | null {
  const document = sourceRoot?.ownerDocument;
  const sourceRect = sourceRoot?.getBoundingClientRect();
  if (sourceRect && pointer.x >= sourceRect.left && pointer.x <= sourceRect.right
    && pointer.y >= sourceRect.top && pointer.y <= sourceRect.bottom) return null;
  const pageRoot = document?.elementFromPoint(pointer.x, pointer.y)
    ?.closest<HTMLElement>(CROSS_DOCUMENT_PAGE_ROOT_SELECTOR);
  return pageRoot && pageRoot !== sourceRoot
    ? crossDocumentPageRootControllers.get(pageRoot) ?? null
    : null;
}

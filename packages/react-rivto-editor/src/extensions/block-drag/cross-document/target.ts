import { DropSurfaceRegistry } from "@chulane/rivto-page";
import type { PageDragOccurrence } from "../../../surfaces/page/page-drag-occurrence";

export { DROP_SURFACE_ATTRIBUTE as CROSS_DOCUMENT_PAGE_ROOT_ATTRIBUTE } from "@chulane/rivto-page";

/** Shared receiving registry for Page and Edgeless; controllers retain commands and lifecycle. */
export const crossDocumentPageRootControllers = new DropSurfaceRegistry<PageDragOccurrence>();

import { DropSurfaceRegistry } from "@chulane/rivto-page";
import type { CrossDocumentPageRootController } from "../types";

export type { CrossDocumentPageRootController } from "../types";
export { DROP_SURFACE_ATTRIBUTE as CROSS_DOCUMENT_PAGE_ROOT_ATTRIBUTE } from "@chulane/rivto-page";

/** Shared receiving registry for Page and Edgeless; controllers retain commands and lifecycle. */
export const crossDocumentPageRootControllers =
  new DropSurfaceRegistry<CrossDocumentPageRootController>();

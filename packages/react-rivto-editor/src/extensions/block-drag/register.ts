import type { ReactEditorApi } from "../../editor/types";
/** Runtime registration for shared Page block dragging in writing pages and canvas cards. */
import { createElement, type ReactNode } from "react";
import { PageDragBoundary } from "../../surfaces/page/page-drag-boundary";
import type { PageDragExtensionOptions } from "./types";

/**
 * Installs the occurrence-owned Page drag boundary used by the independent universal handle.
 *
 * @param reactEditor - Runtime receiving the drag registrations.
 * @param options - Gesture and placement configuration.
 * @returns No value.
 */
export function registerPageDrag(
  reactEditor: ReactEditorApi,
  options: Omit<PageDragExtensionOptions, "children">,
): void {
  /**
   * Supplies this registration's immutable options to the occurrence-owned Page feature.
   *
   * @param props - Existing surface subtree.
   * @returns Optional Page drag installation around the supplied children.
   */
  const PageBoundary = ({ children }: { readonly children?: ReactNode }) =>
    createElement(PageDragBoundary, { ...options, children });
  reactEditor.surfaces.registerEditorWrapper(PageBoundary);
}

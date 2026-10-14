import type { ReactEditorApi } from "../../editor/types";
/** Runtime registration for page block drag wrappers and handle mechanics. */
import { createElement, type ReactNode } from "react";
import { PageDragProvider } from "./provider";
import { PageDragBlockWrapper } from "./surface";
import type { PageDragExtensionOptions } from "./types";

/**
 * Installs the page drag provider and block wrappers used by the independent universal handle.
 *
 * @param reactEditor - Runtime receiving the drag registrations.
 * @param options - Gesture and placement configuration.
 * @returns No value.
 */
export function registerPageDrag(
  reactEditor: ReactEditorApi,
  options: Omit<PageDragExtensionOptions, "children">,
): void {
  const DragBoundary = ({ children }: { readonly children?: ReactNode }) =>
    createElement(PageDragProvider, { ...options, children });
  reactEditor.surfaces.registerEditorWrapper(DragBoundary);
  reactEditor.surfaces.registerBlockWrapper("block", PageDragBlockWrapper);
  reactEditor.surfaces.registerBlockWrapper("edgeless", PageDragBlockWrapper);
}

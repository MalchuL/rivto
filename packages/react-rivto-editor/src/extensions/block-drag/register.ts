/** Runtime registration for page block drag wrappers and handles. */
import { createElement, type ReactNode } from "react";
import type { ReactEditor } from "../../types";
import { PageDragProvider } from "./provider";
import { PageDragBlockSlot, PageDragBlockWrapper } from "./surface";
import type { PageDragExtensionOptions } from "./types";

/**
 * Installs the page drag provider, block wrappers, and handle slot.
 *
 * @param reactEditor - Runtime receiving the drag registrations.
 * @param options - Gesture and placement configuration.
 * @returns No value.
 */
export function registerPageDrag(
  reactEditor: ReactEditor,
  options: Omit<PageDragExtensionOptions, "children">,
): void {
  const DragBoundary = ({ children }: { readonly children?: ReactNode }) =>
    createElement(PageDragProvider, { ...options, children });
  reactEditor.surfaces.registerEditorWrapper(DragBoundary);
  reactEditor.surfaces.registerBlockWrapper("block", PageDragBlockWrapper);
  reactEditor.surfaces.registerBlockWrapper("edgeless", PageDragBlockWrapper);
  reactEditor.surfaces.registerBlockSlot({
    position: "left-top",
    priority: 200,
    component: PageDragBlockSlot,
  });
}

import type { EditorRuntime } from "../../editor/editor-runtime";
/** Runtime registration for page block drag wrappers and handles. */
import { createElement, type ReactNode } from "react";
import { PageDragProvider } from "./provider";
import { PageDragBlockSlot, PageDragBlockWrapper } from "./surface";
import type { PageDragExtensionOptions } from "./types";

/**
 * Installs the page drag provider, block wrappers, and handle slot.
 *
 * @param editorRuntime - Runtime receiving the drag registrations.
 * @param options - Gesture and placement configuration.
 * @returns No value.
 */
export function registerPageDrag(
  editorRuntime: EditorRuntime,
  options: Omit<PageDragExtensionOptions, "children">,
): void {
  const DragBoundary = ({ children }: { readonly children?: ReactNode }) =>
    createElement(PageDragProvider, { ...options, children });
  editorRuntime.surfaces.registerEditorWrapper(DragBoundary);
  editorRuntime.surfaces.registerBlockWrapper("block", PageDragBlockWrapper);
  editorRuntime.surfaces.registerBlockWrapper("edgeless", PageDragBlockWrapper);
  editorRuntime.surfaces.registerBlockSlot({
    position: "left-top",
    priority: 200,
    component: PageDragBlockSlot,
  });
}

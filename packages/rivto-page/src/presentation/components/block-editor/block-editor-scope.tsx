import { BlockDropLayoutContext } from "../../drag-and-drop/block-drop-layout";
import { BlockRootPlacements } from "../../drag-and-drop/block-root-placements";
import { BlockDropDepthContext } from "../../drag-and-drop/block-drop-item";
import { useEffect } from "react";
import type { BlockEditorScopeProps } from "./types";
export type { BlockEditorScopeApi, BlockEditorScopeProps, BlockEditorViewApi } from "./types";
import { BlockRowHover } from "../block-layout/browser/block-row-hover";
import { BlockEditorContext, BlockEditorInputRootContext } from "./block-editor-context";
import { BlockChildrenControlsContext } from "../block-layout/block-item-context";

/**
 * Supplies block rendering context and row hover for a borrowed occurrence Root.
 *
 * A canvas may arrange several addressed forests inside this single occurrence.
 * Selection and input stay shared. The host owns the Root and its attachment;
 * this scope does not destroy the controller or its registrations. The view owns
 * one row-hover observer;
 * pointer and scroll delivery use normalized input while geometry remains
 * browser-specific. The view releases its listeners and feedback on root replacement or unmount.
 * Nested occurrences require their own controller.
 * Each occurrence resets inherited child-control placement to outside, so a
 * nested editor does not borrow the surrounding container's row geometry.
 * Terminal drop-depth destinations also reset at this boundary: a nested editor
 * must never register insertion regions belonging to an enclosing occurrence.
 *
 * @param props - Borrowed controller, occurrence Root and existing view content.
 * @param props.editor - Controller created and destroyed by the host outside render.
 * @param props.inputRoot - Current borrowed Root, or undefined before attachment.
 * @param props.children - Block content and host layout sharing this occurrence.
 * @returns Context without an extra DOM wrapper.
 * @throws Propagates row-hover subscription and cleanup failures.
 */
export function BlockEditorScope({ editor, inputRoot, children }: BlockEditorScopeProps) {
  useEffect(() => {
    const identity = inputRoot?.getElementIdentity?.();
    const editorRoot = editor.inputRoot;
    if (
      !inputRoot ||
      !identity ||
      !inputRoot.isAttached() ||
      !editorRoot?.isAttached() ||
      editorRoot.getElementIdentity?.() !== identity
    ) {
      return;
    }
    const hover = new BlockRowHover(
      identity,
      editor.events,
      () => editor.inputRoot,
      editor.regions,
    );
    return () => hover.destroy();
  }, [editor, inputRoot]);
  return (
    <BlockEditorContext.Provider value={editor}>
      <BlockEditorInputRootContext.Provider value={inputRoot}>
        <BlockChildrenControlsContext.Provider value="outside">
          <BlockDropDepthContext.Provider value={null}>
            <BlockDropLayoutContext.Provider value={null}>
              <BlockRootPlacements>{children}</BlockRootPlacements>
            </BlockDropLayoutContext.Provider>
          </BlockDropDepthContext.Provider>
        </BlockChildrenControlsContext.Provider>
      </BlockEditorInputRootContext.Provider>
    </BlockEditorContext.Provider>
  );
}

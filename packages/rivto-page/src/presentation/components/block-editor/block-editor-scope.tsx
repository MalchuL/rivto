import { useEffect, type ReactNode } from "react";
import type { BlockEditorApi } from "../../../editor/block-editor-api";
import type { BlockEditorController } from "../../../editor/block-editor-controller";
import { BlockRowHover } from "../block-layout/block-row-hover";
import { BlockEditorContext } from "./block-editor-context";

/** View capabilities include occurrence attachment, but not controller destruction. */
export type BlockEditorViewApi = BlockEditorApi & Pick<BlockEditorController, "attach">;

/** Host-owned editor attached to one writing page or canvas viewport. */
export interface BlockEditorScopeProps {
  readonly editor: BlockEditorViewApi;
  /** Untransformed occurrence root, marked with data-rivto-block-editor by its view. */
  readonly root: HTMLElement | null;
  readonly children?: ReactNode;
}

/**
 * Attaches shared block behavior to an existing host root and supplies its rendering context.
 *
 * A canvas may arrange several addressed forests inside this single occurrence.
 * Selection and input stay shared. Unmount releases attachment, not the host-owned
 * controller or its registrations. The view also owns one DOM-only row-hover
 * observer and releases its listeners and feedback on root replacement or unmount.
 * Nested occurrences require their own controller.
 *
 * @param props - Borrowed controller, mounted root and existing view content.
 * @param props.editor - Controller created and destroyed by the host outside render.
 * @param props.root - Current native root, or null before mount or after detach.
 * @param props.children - Block content and host layout sharing this occurrence.
 * @returns Context without an extra DOM wrapper.
 * @throws Propagates attachment and cleanup failures.
 */
export function BlockEditorScope({ editor, root, children }: BlockEditorScopeProps) {
  useEffect(() => (root ? editor.attach(root) : undefined), [editor, root]);
  useEffect(() => {
    if (!root) {
      return;
    }
    const hover = new BlockRowHover(root);
    return () => hover.destroy();
  }, [root]);
  return <BlockEditorContext.Provider value={editor}>{children}</BlockEditorContext.Provider>;
}

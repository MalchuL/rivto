/**
 * Resolves the document boundaries used by page-style navigation.
 * Block mode walks the document root, while structural and horizontal edgeless
 * navigation remains inside the owning card. Vertical caret movement and text
 * extension use the shared surface order so they can reach offscreen cards.
 * Rendered occurrence boundaries are captured separately through Root.
 *
 * @module
 */
import type { EditorBlock, EditorElementNode, DocumentEditorAPI } from "@chulane/rivto";
import type { NavigationCardSource, NavigationParentSource, NavigationScopePanel } from "./types";
import { blockIdsOf } from "../../../../../elements/block-element-projection";

/** Walks to the document root that owns `blockId`. */
export function owningRootId(
  editor: NavigationParentSource | DocumentEditorAPI,
  blockId: string,
): string {
  let rootId = blockId;
  for (
    let parentId = editor.blocks.getParentId(rootId);
    parentId;
    parentId = editor.blocks.getParentId(rootId)
  ) {
    rootId = parentId;
  }
  return rootId;
}

/** Finds the edgeless card element whose root range includes `blockId`. */
export function owningBlockElement(
  editor: NavigationCardSource | DocumentEditorAPI,
  blockId: string,
): EditorElementNode | undefined {
  const rootId = owningRootId(editor, blockId);
  const rootOrder = editor.blocks.getRootIds();
  return editor.elements
    .getElementNodes()
    .find((element) => element.type === "block" && blockIdsOf(element, rootOrder).includes(rootId));
}

/**
 * Outline forest used by caret, block-selection, and structural keyboard moves.
 *
 * Page mode uses the complete document. Edgeless mode keeps navigation inside
 * the card that owns `blockId`, so structural movement does not cross into another
 * element. Vertical caret navigation uses the surface projection instead.
 * React callers use their rendered view's surface; core-only callers use the
 * document mode because they have no DOM occurrence.
 */
export function navigationOutlineBlocks(
  editor: NavigationScopePanel | DocumentEditorAPI,
  blockId: string,
): EditorBlock[] {
  const roots = editor.blocks.getBlocks();
  let outline = roots;
  // Navigation follows the rendered view, which can be a page in an edgeless document.
  // Core-only callers have no view and use the complete block outline.
  const mode = "getSurfaceType" in editor ? editor.getSurfaceType() : "block";
  if (mode === "edgeless") {
    const element = owningBlockElement(editor, blockId);
    if (!element) {
      const root = roots.find((block) => block.id === owningRootId(editor, blockId));
      outline = root ? [root] : [];
    } else {
      const allowed = new Set(
        blockIdsOf(
          element,
          roots.map((block) => block.id),
        ),
      );
      outline = roots.filter((block) => allowed.has(block.id));
    }
  }
  return outline;
}

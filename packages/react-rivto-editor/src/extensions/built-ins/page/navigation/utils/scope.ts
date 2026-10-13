/**
 * Resolves the document and DOM boundaries used by page-style navigation.
 * Block mode walks the document root, while edgeless mode remains inside the
 * owning card so keyboard actions cannot cross visual containers.
 *
 * @module
 */
import type {
  EditorBlock,
  EditorElementNode,
  DocumentEditorAPI,
} from "@chulane/rivto";
import type { ReactPanelApi } from "../../../../../panels/types";
import { blockIdsOf } from "../../../../../elements/block-element-projection";
import { findRenderedBlock } from "../../../../../managers/events/block-dom";

const EDGELESS_ROOT_SELECTOR = "[data-edgeless-root]";

/** Walks to the document root that owns `blockId`. */
export function owningRootId(editor: ReactPanelApi | DocumentEditorAPI, blockId: string): string {
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
  editor: ReactPanelApi | DocumentEditorAPI,
  blockId: string,
): EditorElementNode | undefined {
  const rootId = owningRootId(editor, blockId);
  const rootOrder = editor.blocks.getRootIds();
  return editor.elements.getElementNodes().find(
    (element) => element.type === "block" && blockIdsOf(element, rootOrder).includes(rootId),
  );
}

/**
 * Outline forest used by caret, block-selection, and structural keyboard moves.
 *
 * Page mode uses the complete document. Edgeless mode keeps navigation inside
 * the card that owns `blockId`, so Up/Down never crosses into another element.
 * React callers use their rendered view's surface; core-only callers use the
 * document mode because they have no DOM occurrence.
 */
export function navigationOutlineBlocks(editor: ReactPanelApi | DocumentEditorAPI, blockId: string): EditorBlock[] {
  const roots = editor.blocks.getBlocks();
  let outline = roots;
  // Navigation follows the rendered view, which can be a page in an edgeless document.
  // Core-only callers have no view and use the complete block outline.
  const mode = "events" in editor ? editor.events.getSurfaceType() : "block";
  if (mode === "edgeless") {
    const element = owningBlockElement(editor, blockId);
    if (!element) {
      const root = roots.find((block) => block.id === owningRootId(editor, blockId));
      outline = root ? [root] : [];
    } else {
      const allowed = new Set(blockIdsOf(element, roots.map((block) => block.id)));
      outline = roots.filter((block) => allowed.has(block.id));
    }
  }
  return outline;
}

/**
 * DOM scope for editable-block walks (`findNext` / vertical caret).
 *
 * Edgeless cards expose their own `[data-edgeless-root]` host, so querying from
 * that host cannot see siblings on other cards.
 * Embedded sources keep their document-view root even when rendered inside a
 * host card, so navigation cannot escape into the host's document.
 */
export function navigationDomRoot(surfaceRoot: HTMLElement, blockId: string): HTMLElement {
  const card = findRenderedBlock(surfaceRoot, blockId)?.closest<HTMLElement>(EDGELESS_ROOT_SELECTOR);
  return card && surfaceRoot.contains(card) ? card : surfaceRoot;
}

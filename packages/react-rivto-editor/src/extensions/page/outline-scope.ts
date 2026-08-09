import type {
  EditorBlock,
  EditorElement,
  RivtoEditorApi as Editor,
} from "@chulane/rivto";
import { findRenderedBlock } from "../../managers";
import { blockIdsOf } from "../../surfaces/edgeless/block-elements";

const EDGELESS_ROOT_SELECTOR = "[data-edgeless-root]";

/** Walks to the document root that owns `blockId`. */
export function owningRootId(editor: Editor, blockId: string): string {
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
  editor: Editor,
  blockId: string,
): EditorElement | undefined {
  const rootId = owningRootId(editor, blockId);
  const rootOrder = editor.blocks.getRootIds();
  return editor.elements.getElements().find(
    (element) => element.type === "block" && blockIdsOf(element, rootOrder).includes(rootId),
  );
}

/**
 * Outline forest used by caret, block-selection, and structural keyboard moves.
 *
 * Page mode uses the complete document. Edgeless mode keeps navigation inside
 * the card that owns `blockId`, so Up/Down never crosses into another element.
 */
export function navigationOutlineBlocks(editor: Editor, blockId: string): EditorBlock[] {
  const roots = editor.blocks.getBlocks();
  if (editor.mode.get() !== "edgeless") return roots;
  const element = owningBlockElement(editor, blockId);
  if (!element) {
    const root = roots.find((block) => block.id === owningRootId(editor, blockId));
    return root ? [root] : [];
  }
  const allowed = new Set(blockIdsOf(element, editor.blocks.getRootIds()));
  return roots.filter((block) => allowed.has(block.id));
}

/**
 * DOM scope for editable-block walks (`findNext` / vertical caret).
 *
 * Edgeless cards expose their own `[data-edgeless-root]` host, so querying from
 * that host cannot see siblings on other cards.
 */
export function navigationDomRoot(surfaceRoot: HTMLElement, blockId: string): HTMLElement {
  return findRenderedBlock(surfaceRoot, blockId)
    ?.closest<HTMLElement>(EDGELESS_ROOT_SELECTOR) ?? surfaceRoot;
}

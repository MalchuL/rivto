import { useEffect, type RefObject } from "react";
import type { RivtoEditorApi } from "../../../editor";
import { RIVTO_BLOCK_ATTR, RIVTO_BLOCK_CONTENT_ATTR } from "../blocks/dom";
import { readEditorSelection, restoreEditorSelection } from "../selection";
import type { SelectionBridgeApi } from "./selection-bridge";

interface EventsBridgeProps {
  /** Long-lived editor runtime. Reserved for later keyboard/copy/paste routing. */
  readonly editor: RivtoEditorApi;
  /** Root DOM element for one mounted editor view. */
  readonly root: RefObject<HTMLElement | null>;
  /** Selection bridge callbacks used by delegated DOM events. */
  readonly selectionBridge: RefObject<SelectionBridgeApi | null>;
}

function syncEditableDom(root: HTMLElement, editor: RivtoEditorApi): void {
  root.querySelectorAll<HTMLElement>(`[${RIVTO_BLOCK_CONTENT_ATTR}]`).forEach((content) => {
    const blockId = content.closest<HTMLElement>(`[${RIVTO_BLOCK_ATTR}]`)?.getAttribute(RIVTO_BLOCK_ATTR);
    const block = blockId ? editor.getBlock(blockId) : undefined;
    if (block && content.textContent !== block.content) content.textContent = block.content;
  });
  const selection = editor.selection.get();
  if (selection?.type === "text") restoreEditorSelection(root, selection);
}

/**
 * Central DOM event bridge for the React editor view.
 *
 * It is intentionally React-side only: native events are delegated to focused
 * bridges without introducing a public runtime EventRouter API.
 */
export function EventsBridge({ editor: _editor, root, selectionBridge }: EventsBridgeProps): null {
  useEffect(() => {
    const currentRoot = root.current;
    if (!currentRoot) return undefined;
    const pointerDown = (event: PointerEvent): void => {
      selectionBridge.current?.handlePointerDown(event);
    };
    currentRoot.addEventListener("pointerdown", pointerDown, true);
    return () => currentRoot.removeEventListener("pointerdown", pointerDown, true);
  }, [root, selectionBridge]);

  useEffect(() => {
    const currentRoot = root.current;
    if (!currentRoot) return undefined;
    const syncSelection = (): void => {
      const selection = readEditorSelection(currentRoot);
      if (selection) _editor.execute("selection.set", { selection });
    };
    const copy = (event: ClipboardEvent): void => {
      syncSelection();
      _editor.execute("clipboard.copy", { event });
    };
    const cut = (event: ClipboardEvent): void => {
      syncSelection();
      _editor.execute("clipboard.cut", { event });
      syncEditableDom(currentRoot, _editor);
    };
    const paste = (event: ClipboardEvent): void => {
      syncSelection();
      _editor.execute("clipboard.paste", { event, defaultBlockType: "paragraph" });
      syncEditableDom(currentRoot, _editor);
    };
    currentRoot.addEventListener("copy", copy);
    currentRoot.addEventListener("cut", cut);
    currentRoot.addEventListener("paste", paste);
    return () => {
      currentRoot.removeEventListener("copy", copy);
      currentRoot.removeEventListener("cut", cut);
      currentRoot.removeEventListener("paste", paste);
    };
  }, [_editor, root]);

  return null;
}

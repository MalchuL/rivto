import { useEffect, type RefObject } from "react";
import type { RivtoEditorApi } from "../../../editor";
import type { SelectionBridgeApi } from "./selection-bridge";

interface EventsBridgeProps {
  /** Long-lived editor runtime. Reserved for later keyboard/copy/paste routing. */
  readonly editor: RivtoEditorApi;
  /** Root DOM element for one mounted editor view. */
  readonly root: RefObject<HTMLElement | null>;
  /** Selection bridge callbacks used by delegated DOM events. */
  readonly selectionBridge: RefObject<SelectionBridgeApi | null>;
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

  return null;
}

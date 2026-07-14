import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from "react";
import type { EditorPosition, RivtoEditorApi } from "../../../editor";
import { RIVTO_BLOCK_CONTENT_ATTR } from "../blocks/dom";
import {
  RIVTO_POINTER_SELECTING_ATTR,
  clearCrossBlockHighlight,
  clearNativeSelection,
  readDOMPointPosition,
  readDOMSelectionPoint,
  readEditorSelection,
  restoreEditorSelection,
  setNativeSelection,
  updateCrossBlockHighlight,
  type DOMSelectionPoint,
} from "../selection";
import type { SurfaceType } from "./types";

/** Public callbacks exposed by SelectionBridge to DOM event bridges. */
export interface SelectionBridgeApi {
  /** Starts tracking pointer text selection when pointerdown begins in editable content. */
  handlePointerDown(event: PointerEvent): void;
}

interface PointerTextSelection {
  anchor: DOMSelectionPoint;
  anchorPosition: EditorPosition;
  synthetic: boolean;
}

interface SelectionBridgeProps {
  /** Long-lived editor runtime that owns local selection state. */
  readonly editor: RivtoEditorApi;
  /** Root DOM element for one mounted editor view. */
  readonly root: RefObject<HTMLElement | null>;
  /** Current surface, used to refresh selection after mode swaps. */
  readonly surfaceType: SurfaceType;
  /** Mutable API slot consumed by EventsBridge. */
  readonly api: RefObject<SelectionBridgeApi | null>;
}

function sameTextSelection(root: HTMLElement, selection: ReturnType<RivtoEditorApi["selection"]["get"]>): boolean {
  if (!selection || selection.type !== "text") return false;
  const native = readEditorSelection(root);
  return Boolean(native
    && native.anchor.blockId === selection.anchor.blockId
    && native.anchor.offset === selection.anchor.offset
    && native.head.blockId === selection.head.blockId
    && native.head.offset === selection.head.offset);
}

/**
 * Bridges native DOM selection behavior to editor-local selection state.
 *
 * This component renders nothing. It owns browser `selectionchange`, native
 * selection restoration, cross-block highlight paint, and pointer selection
 * across independent contenteditable hosts.
 */
export function SelectionBridge({ editor, root, surfaceType, api }: SelectionBridgeProps): null {
  const pointerSelection = useRef<PointerTextSelection | null>(null);
  const selectionRevision = useSyncExternalStore(
    (listener) => editor.selection.subscribe(listener),
    () => JSON.stringify(editor.selection.get()),
    () => "null",
  );

  useEffect(() => {
    api.current = {
      handlePointerDown(event) {
        if (event.button !== 0 || !root.current) return;
        const target = event.target instanceof Element
          ? event.target.closest<HTMLElement>(`[${RIVTO_BLOCK_CONTENT_ATTR}]`)
          : null;
        if (!target || !root.current.contains(target)) return;
        const anchor = readDOMSelectionPoint(root.current, event.clientX, event.clientY);
        const anchorPosition = anchor ? readDOMPointPosition(root.current, anchor) : undefined;
        pointerSelection.current = anchor && anchorPosition ? { anchor, anchorPosition, synthetic: false } : null;
      },
    };
    return () => {
      api.current = null;
    };
  }, [api, root]);

  useEffect(() => {
    const synchronizeSelection = (): void => {
      if (!root.current) return;
      if (root.current.hasAttribute(RIVTO_POINTER_SELECTING_ATTR)) return;
      const selection = readEditorSelection(root.current);
      if (selection) editor.execute("selection.set", { selection });
    };
    document.addEventListener("selectionchange", synchronizeSelection);
    return () => document.removeEventListener("selectionchange", synchronizeSelection);
  }, [editor, root]);

  useEffect(() => {
    const move = (event: PointerEvent): void => {
      if (!root.current || !pointerSelection.current) return;
      const head = readDOMSelectionPoint(root.current, event.clientX, event.clientY);
      if (!head) return;
      if (head.content === pointerSelection.current.anchor.content) return;
      pointerSelection.current.synthetic = true;
      root.current.setAttribute(RIVTO_POINTER_SELECTING_ATTR, "true");
      setNativeSelection(pointerSelection.current.anchor, head);
      const headPosition = readDOMPointPosition(root.current, head);
      if (!headPosition) return;
      editor.execute("selection.set", {
        selection: {
          type: "text",
          anchor: pointerSelection.current.anchorPosition,
          head: headPosition,
        },
      });
    };
    const stop = (): void => {
      const synthetic = pointerSelection.current?.synthetic ?? false;
      if (root.current) root.current.removeAttribute(RIVTO_POINTER_SELECTING_ATTR);
      pointerSelection.current = null;
      if (synthetic || !root.current) return;
      const selection = readEditorSelection(root.current);
      if (selection) editor.execute("selection.set", { selection });
    };
    window.addEventListener("pointermove", move, { passive: false, capture: true });
    window.addEventListener("pointerup", stop, true);
    return () => {
      if (root.current) root.current.removeAttribute(RIVTO_POINTER_SELECTING_ATTR);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", stop, true);
    };
  }, [editor, root]);

  useLayoutEffect(() => {
    if (!root.current) return undefined;
    const selection = editor.selection.get();
    const activeContent = document.activeElement instanceof HTMLElement
      ? document.activeElement.closest<HTMLElement>(`[${RIVTO_BLOCK_CONTENT_ATTR}]`)
      : null;
    if (selection?.type === "text") {
      if (!activeContent || !root.current.contains(activeContent)) {
        if (!sameTextSelection(root.current, selection)) restoreEditorSelection(root.current, selection);
      }
      updateCrossBlockHighlight(root.current, selection);
    } else {
      clearNativeSelection(root.current);
      updateCrossBlockHighlight(root.current, selection);
    }
    return () => {
      if (root.current) clearCrossBlockHighlight(root.current);
    };
  }, [editor, root, selectionRevision, surfaceType]);

  return null;
}

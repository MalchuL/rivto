import { Fragment, createElement, useEffect, useLayoutEffect, useRef, type PropsWithChildren } from "react";
import type { EditorPosition } from "../../../editor";
import { RIVTO_BLOCK_CONTENT_ATTR } from "../blocks/dom";
import { useEditor, useEditorEvent, useEditorRevision, useEditorRoot } from "../editor/context";
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
import type { ViewPlugin } from "../editor/types";

interface PointerSelection {
  anchor: DOMSelectionPoint;
  position: EditorPosition;
  synthetic: boolean;
}

function TextSelectionView({ children }: PropsWithChildren) {
  const editor = useEditor();
  const root = useEditorRoot();
  const revision = useEditorRevision();
  const pointer = useRef<PointerSelection | null>(null);

  useEditorEvent("pointerdown", (event) => {
    if (event.defaultPrevented || event.button !== 0 || !root.current) return;
    const content = event.target instanceof Element
      ? event.target.closest<HTMLElement>(`[${RIVTO_BLOCK_CONTENT_ATTR}]`)
      : null;
    if (!content || !root.current.contains(content)) return;
    const anchor = readDOMSelectionPoint(root.current, event.clientX, event.clientY);
    const position = anchor ? readDOMPointPosition(root.current, anchor) : undefined;
    pointer.current = anchor && position ? { anchor, position, synthetic: false } : null;
  }, true);

  useEffect(() => {
    const selectionChange = (): void => {
      if (!root.current || root.current.hasAttribute(RIVTO_POINTER_SELECTING_ATTR)) return;
      const selection = readEditorSelection(root.current);
      if (selection) editor.execute("selection.set", { selection });
    };
    const move = (event: PointerEvent): void => {
      if (!root.current || !pointer.current) return;
      const head = readDOMSelectionPoint(root.current, event.clientX, event.clientY);
      if (!head || head.content === pointer.current.anchor.content) return;
      const position = readDOMPointPosition(root.current, head);
      if (!position) return;
      pointer.current.synthetic = true;
      root.current.setAttribute(RIVTO_POINTER_SELECTING_ATTR, "true");
      setNativeSelection(pointer.current.anchor, head);
      editor.execute("selection.set", {
        selection: { type: "text", anchor: pointer.current.position, head: position },
      });
    };
    const stop = (): void => {
      const tracked = pointer.current;
      pointer.current = null;
      root.current?.removeAttribute(RIVTO_POINTER_SELECTING_ATTR);
      if (!tracked || tracked.synthetic || !root.current) return;
      const selection = readEditorSelection(root.current);
      if (selection) editor.execute("selection.set", { selection });
    };
    document.addEventListener("selectionchange", selectionChange);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", stop, true);
    return () => {
      document.removeEventListener("selectionchange", selectionChange);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", stop, true);
      root.current?.removeAttribute(RIVTO_POINTER_SELECTING_ATTR);
    };
  }, [editor, root]);

  useLayoutEffect(() => {
    if (!root.current) return undefined;
    const selection = editor.selection.get();
    if (selection?.type === "text") {
      const active = document.activeElement instanceof HTMLElement
        ? document.activeElement.closest<HTMLElement>(`[${RIVTO_BLOCK_CONTENT_ATTR}]`)
        : null;
      if (!active || !root.current.contains(active)) restoreEditorSelection(root.current, selection);
      updateCrossBlockHighlight(root.current, selection);
    } else {
      clearNativeSelection(root.current);
      updateCrossBlockHighlight(root.current, selection);
    }
    return () => {
      if (root.current) clearCrossBlockHighlight(root.current);
    };
  }, [editor, revision, root]);

  return createElement(Fragment, null, children);
}

export const textSelectionPlugin: ViewPlugin = { id: "rivto.text-selection", View: TextSelectionView };

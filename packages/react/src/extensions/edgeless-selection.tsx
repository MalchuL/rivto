import type { BlockSelection } from "@chulane/rivto";
import { BLOCK_CONTENT_SELECTOR } from "../constants";
import {
  useDOMEvent,
  useEditor,
  useEditorMode,
  useEditorRoot,
  useKeyboardEvent,
} from "../hooks";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../managers";
import {
  rootsInRect,
  type EdgelessRect,
} from "./edgeless-geometry";
import { toggleBlockSelection } from "./page-selection-utils";

interface RectangleGesture {
  readonly x: number;
  readonly y: number;
  moved: boolean;
}

const ROOT_SELECTOR = "[data-edgeless-root]";
const HANDLE_SELECTOR = "[data-edgeless-drag-handle], [data-edgeless-resize-handle]";

/** Publishes one ordered whole-block selection. */
function selectBlocks(editor: ReturnType<typeof useEditor>, blockIds: string[]): void {
  if (!blockIds.length) editor.selection.clear();
  else editor.selection.set([{
    type: "block",
    blockIds,
    anchorBlockId: blockIds[0]!,
    focusBlockId: blockIds.at(-1)!,
  }]);
}

/** Returns true for controls that retain their normal interaction without Primary. */
function isInteractive(target: Element): boolean {
  return Boolean(target.closest(`${BLOCK_CONTENT_SELECTOR}, input, textarea, select, button, a`));
}

/**
 * Owns whole-block selection on the edgeless canvas.
 *
 * Primary-click can select any nested BlockView. Card-background and rectangle
 * gestures select root cards because only roots are independent canvas
 * objects. Layout extensions project arbitrary selected blocks back to their
 * owning roots when a canvas move is requested.
 */
export function EdgelessInteractionOverlay() {
  const editor = useEditor();
  const { mode } = useEditorMode();
  const { element: root } = useEditorRoot();
  const gesture = useRef<RectangleGesture | null>(null);
  const [rectangle, setRectangle] = useState<EdgelessRect | null>(null);

  useEffect(() => {
    if (mode !== "edgeless") {
      gesture.current = null;
      setRectangle(null);
    }
  }, [mode]);

  useDOMEvent({
    id: "edgeless.selection.pointer-start",
    type: "pointerdown",
    capture: true,
    mode: "edgeless",
  }, ({ raw: event }) => {
    if (event.button !== 0 || !(event.target instanceof Element) || !root) return false;
    if (root.dataset.panningReady === "true") return false;
    if (event.target.closest(HANDLE_SELECTOR)) return false;
    const card = event.target.closest<HTMLElement>(ROOT_SELECTOR);
    const blockId = card?.dataset.edgelessRoot;
    const primary = event.ctrlKey || event.metaKey;

    if (card && blockId && primary) {
      const current = editor.selection.get().find((item): item is BlockSelection => item.type === "block");
      const next = toggleBlockSelection(editor.getBlocks(), current, blockId, true);
      if (next) editor.selection.set([next]);
      else editor.selection.clear();
      root.ownerDocument.getSelection()?.removeAllRanges();
      card.focus({ preventScroll: true });
      return true;
    }

    if (card) {
      if (isInteractive(event.target)) return false;
      selectBlocks(editor, blockId ? [blockId] : []);
      card.focus({ preventScroll: true });
      return true;
    }

    if (event.target.closest(".edgeless-zoom-controls")) return false;
    root.focus({ preventScroll: true });
    editor.selection.clear();
    gesture.current = { x: event.clientX, y: event.clientY, moved: false };
    return true;
  });

  useDOMEvent({
    id: "edgeless.selection.pointer-move",
    type: "pointermove",
    target: "window",
    mode: "edgeless",
    passive: false,
  }, ({ raw: event }) => {
    const start = gesture.current;
    if (!start || !root || root.dataset.panning === "true") return false;
    if (!start.moved && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 3) return false;
    start.moved = true;
    const next = {
      left: Math.min(start.x, event.clientX),
      top: Math.min(start.y, event.clientY),
      right: Math.max(start.x, event.clientX),
      bottom: Math.max(start.y, event.clientY),
    };
    setRectangle(next);
    const cards = [...root.querySelectorAll<HTMLElement>(ROOT_SELECTOR)].flatMap((card) => {
      const id = card.dataset.edgelessRoot;
      const rect = card.getBoundingClientRect();
      return id ? [{ id, rect }] : [];
    });
    selectBlocks(editor, rootsInRect(cards, next));
    return true;
  });

  const stopRectangle = () => {
    if (!gesture.current) return false;
    gesture.current = null;
    setRectangle(null);
    return false;
  };
  useDOMEvent({
    id: "edgeless.selection.pointer-end",
    type: "pointerup",
    target: "window",
    mode: "edgeless",
  }, stopRectangle);
  useDOMEvent({
    id: "edgeless.selection.pointer-cancel",
    type: "pointercancel",
    target: "window",
    mode: "edgeless",
  }, stopRectangle);

  useKeyboardEvent({
    id: KEYBOARD_BINDING_IDS.edgelessSelectionClear,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.edgelessSelectionClear],
    mode: "edgeless",
    when: ({ root, selection }) =>
      !root.dataset.transforming &&
      selection.some((item) => item.type === "block"),
  }, () => {
    if (!root) return false;
    const selection = editor.selection.get().find((item): item is BlockSelection => item.type === "block");
    if (!selection) return false;
    editor.selection.clear();
    root.focus({ preventScroll: true });
    return true;
  });

  return rectangle && root ? createPortal(
    <div
      className="edgeless-selection-rectangle"
      data-edgeless-selection-rectangle="true"
      style={{
        left: rectangle.left,
        top: rectangle.top,
        width: rectangle.right - rectangle.left,
        height: rectangle.bottom - rectangle.top,
      }}
    />,
    root.ownerDocument.body,
  ) : null;
}

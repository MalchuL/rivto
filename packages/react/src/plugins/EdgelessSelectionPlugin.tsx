import type { EdgelessSelection } from "@chulane/rivto";
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
  owningRootIds,
  rootsInRect,
  type EdgelessRect,
} from "./utils/edgeless-geometry";

interface RectangleGesture {
  readonly x: number;
  readonly y: number;
  moved: boolean;
}

const ROOT_SELECTOR = "[data-edgeless-root]";
const HANDLE_SELECTOR = "[data-edgeless-drag-handle], [data-edgeless-resize-handle]";

/** Publishes one root-only edgeless selection. */
function selectRoots(editor: ReturnType<typeof useEditor>, blockIds: string[]): void {
  if (!blockIds.length) editor.selection.clear();
  else editor.selection.set([{ type: "edgeless", blockIds }]);
}

/** Returns true for controls that retain their normal interaction without Primary. */
function isInteractive(target: Element): boolean {
  return Boolean(target.closest(`${BLOCK_CONTENT_SELECTOR}, input, textarea, select, button, a`));
}

/**
 * Owns root-object selection on the demo edgeless canvas.
 *
 * Nested BlockViews remain useful text and clipboard endpoints, but every
 * object gesture resolves through its nearest `data-edgeless-root`. Rectangle
 * hit testing likewise inspects only root cards, ensuring descendants never
 * become independently movable objects.
 */
export function EdgelessSelectionPlugin() {
  const editor = useEditor();
  const { mode } = useEditorMode();
  const { element: root } = useEditorRoot();
  const gesture = useRef<RectangleGesture | null>(null);
  const [rectangle, setRectangle] = useState<EdgelessRect | null>(null);

  // Clipboard paste, slash duplication, and cross-card text gestures can
  // temporarily publish a block selection. In edgeless mode, a block-only
  // result means its unique owning root objects.
  useEffect(() => {
    if (mode !== "edgeless") {
      gesture.current = null;
      setRectangle(null);
      return;
    }
    const selection = editor.selection.get();
    if (selection.some((item) => item.type === "text")) return;
    const blockIds = selection.flatMap((item) => item.type === "block" ? item.blockIds : []);
    if (!blockIds.length) return;
    selectRoots(editor, owningRootIds(editor.getBlocks(), blockIds));
  }, [editor, editor.revision, mode]);

  useDOMEvent("pointerdown", ({ event }) => {
    if (event.button !== 0 || !(event.target instanceof Element) || !root) return false;
    if (root.dataset.panningReady === "true") return false;
    if (event.target.closest(HANDLE_SELECTOR)) return false;
    const card = event.target.closest<HTMLElement>(ROOT_SELECTOR);
    const blockId = card?.dataset.edgelessRoot;
    const primary = event.ctrlKey || event.metaKey;

    if (card && blockId && primary) {
      const current = editor.selection.get().find((item): item is EdgelessSelection => item.type === "edgeless");
      const selected = new Set(current?.blockIds ?? []);
      if (selected.has(blockId)) selected.delete(blockId);
      else selected.add(blockId);
      selectRoots(editor, editor.getBlocks().map((block) => block.id).filter((id) => selected.has(id)));
      root.ownerDocument.getSelection()?.removeAllRanges();
      card.focus({ preventScroll: true });
      return true;
    }

    if (card) {
      if (isInteractive(event.target)) return false;
      selectRoots(editor, blockId ? [blockId] : []);
      card.focus({ preventScroll: true });
      return true;
    }

    if (event.target.closest(".edgeless-zoom-controls")) return false;
    root.focus({ preventScroll: true });
    editor.selection.clear();
    gesture.current = { x: event.clientX, y: event.clientY, moved: false };
    return true;
  }, { capture: true, mode: "edgeless" });

  useDOMEvent("pointermove", ({ event }) => {
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
    selectRoots(editor, rootsInRect(cards, next));
    return true;
  }, { target: "window", mode: "edgeless", passive: false });

  const stopRectangle = () => {
    if (!gesture.current) return false;
    gesture.current = null;
    setRectangle(null);
    return false;
  };
  useDOMEvent("pointerup", stopRectangle, { target: "window", mode: "edgeless" });
  useDOMEvent("pointercancel", stopRectangle, { target: "window", mode: "edgeless" });

  useKeyboardEvent({
    id: KEYBOARD_BINDING_IDS.edgelessSelectionClear,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.edgelessSelectionClear],
    mode: "edgeless",
    when: ({ root: currentRoot, selection }) =>
      !currentRoot.dataset.transforming &&
      selection.some((item) => item.type === "edgeless"),
  }, () => {
    if (!root) return false;
    const selection = editor.selection.get().find((item): item is EdgelessSelection => item.type === "edgeless");
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

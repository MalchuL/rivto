import {
  BLOCK_CONTENT_SELECTOR,
  useEditor,
  useEditorEvent,
  useEditorRoot,
  type EdgelessSelection,
} from "../internal";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  owningRootIds,
  rootsInRect,
  translatedLayouts,
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
  if (!blockIds.length) editor.execute("selection.clear");
  else editor.execute("selection.set", { selection: [{ type: "edgeless", blockIds }] });
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
  const { element: root } = useEditorRoot();
  const gesture = useRef<RectangleGesture | null>(null);
  const [rectangle, setRectangle] = useState<EdgelessRect | null>(null);

  // Clipboard paste, slash duplication, and cross-card text gestures can
  // temporarily publish a block selection. In edgeless mode, a block-only
  // result means its unique owning root objects.
  useEffect(() => {
    const selection = editor.selection.get();
    if (selection.some((item) => item.type === "text")) return;
    const blockIds = selection.flatMap((item) => item.type === "block" ? item.blockIds : []);
    if (!blockIds.length) return;
    selectRoots(editor, owningRootIds(editor.getBlocks(), blockIds));
  }, [editor, editor.revision]);

  useEditorEvent("pointerdown", (event) => {
    if (event.defaultPrevented || event.button !== 0 || !(event.target instanceof Element) || !root) return;
    if (event.target.closest(HANDLE_SELECTOR)) return;
    const card = event.target.closest<HTMLElement>(ROOT_SELECTOR);
    const blockId = card?.dataset.edgelessRoot;
    const primary = event.ctrlKey || event.metaKey;

    if (card && blockId && primary) {
      event.preventDefault();
      const current = editor.selection.get().find((item): item is EdgelessSelection => item.type === "edgeless");
      const selected = new Set(current?.blockIds ?? []);
      if (selected.has(blockId)) selected.delete(blockId);
      else selected.add(blockId);
      selectRoots(editor, editor.getBlocks().map((block) => block.id).filter((id) => selected.has(id)));
      root.ownerDocument.getSelection()?.removeAllRanges();
      card.focus({ preventScroll: true });
      return;
    }

    if (card) {
      if (isInteractive(event.target)) return;
      event.preventDefault();
      selectRoots(editor, blockId ? [blockId] : []);
      card.focus({ preventScroll: true });
      return;
    }

    if (event.target.closest(".edgeless-zoom-controls")) return;
    event.preventDefault();
    root.focus({ preventScroll: true });
    editor.execute("selection.clear");
    gesture.current = { x: event.clientX, y: event.clientY, moved: false };
  }, true);

  useEffect(() => {
    if (!root) return;
    const move = (event: PointerEvent) => {
      const start = gesture.current;
      if (!start || root.dataset.panning === "true") return;
      if (!start.moved && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 3) return;
      event.preventDefault();
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
    };
    const stop = () => {
      gesture.current = null;
      setRectangle(null);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [editor, root]);

  useEditorEvent("keydown", (event) => {
    if (event.defaultPrevented || event.isComposing || !root) return;
    const selection = editor.selection.get().find((item): item is EdgelessSelection => item.type === "edgeless");
    if (!selection) return;
    const target = event.target as HTMLElement;
    const handle = target.closest(HANDLE_SELECTOR);
    if (target.isContentEditable || (!handle && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(target.tagName))) return;

    if (event.key === "Escape") {
      event.preventDefault();
      editor.execute("selection.clear");
      root.focus({ preventScroll: true });
      return;
    }
    if ((event.key === "Backspace" || event.key === "Delete") && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      editor.deleteSelection();
      const current = editor.selection.get().find((item) => item.type === "text");
      const owner = current ? owningRootIds(editor.getBlocks(), [current.head.blockId]) : [];
      selectRoots(editor, owner.length ? owner : editor.getBlocks().slice(0, 1).map((block) => block.id));
      requestAnimationFrame(() => root.focus({ preventScroll: true }));
      return;
    }
    if (!event.key.startsWith("Arrow") || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    const dx = event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0;
    const dy = event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0;
    const patches = translatedLayouts(editor.getBlocks(), selection.blockIds, dx, dy);
    editor.document.transact(() => patches.forEach(({ id, layout }) => editor.setBlockLayout(id, layout)));
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

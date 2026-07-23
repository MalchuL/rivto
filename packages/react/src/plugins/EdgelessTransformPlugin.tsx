import {
  useEditor,
  useEditorEvent,
  useEditorRoot,
  type EdgelessSelection,
  type EditorBlockLayout,
} from "../internal";
import { useEffect, useRef } from "react";
import { canvasDelta } from "./edgeless-geometry";

const ROOT_SELECTOR = "[data-edgeless-root]";

interface TransformStart {
  readonly kind: "move" | "resize";
  readonly x: number;
  readonly y: number;
  readonly ids: string[];
  readonly layouts: Map<string, EditorBlockLayout>;
  moved: boolean;
}

/** Finds a rendered root card without interpolating an arbitrary ID into CSS. */
function cardFor(root: HTMLElement, id: string): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>(ROOT_SELECTOR)].find((card) => card.dataset.edgelessRoot === id);
}

/**
 * Adds atomic root dragging and resizing through delegated canvas handles.
 *
 * Pointer movement changes only temporary inline styles. Persisted CRDT layout
 * is patched once on pointer-up, so a grouped gesture is one transaction and
 * one undo item instead of hundreds of pointermove history entries.
 */
export function EdgelessTransformPlugin() {
  const editor = useEditor();
  const { element: root } = useEditorRoot();
  const start = useRef<TransformStart | null>(null);
  const cleanupGesture = useRef<() => void>(() => undefined);

  const clearPreview = (restoreSize = true) => {
    const current = start.current;
    if (!root || !current) return;
    current.ids.forEach((id) => {
      const card = cardFor(root, id);
      if (!card) return;
      card.style.removeProperty("transform");
      const layout = current.layouts.get(id);
      if (current.kind === "resize" && restoreSize && layout) {
        card.style.width = `${layout.width}px`;
        card.style.height = `${layout.height}px`;
      }
    });
    delete root.dataset.transforming;
  };

  useEditorEvent("pointerdown", (event) => {
    if (event.defaultPrevented || event.button !== 0 || !(event.target instanceof Element) || !root) return;
    const moveHandle = event.target.closest("[data-edgeless-drag-handle]");
    const resizeHandle = event.target.closest("[data-edgeless-resize-handle]");
    if (!moveHandle && !resizeHandle) return;
    const card = event.target.closest<HTMLElement>(ROOT_SELECTOR);
    const blockId = card?.dataset.edgelessRoot;
    if (!card || !blockId) return;
    event.preventDefault();
    event.stopPropagation();

    const current = editor.selection.get().find((item): item is EdgelessSelection => item.type === "edgeless");
    const ids = moveHandle && current?.blockIds.includes(blockId) ? current.blockIds : [blockId];
    if (!current?.blockIds.includes(blockId)) {
      editor.execute("selection.set", { selection: [{ type: "edgeless", blockIds: [blockId] }] });
    }
    const roots = new Map(editor.getBlocks().map((block) => [block.id, block]));
    const layouts = new Map(ids.flatMap((id) => {
      const layout = roots.get(id)?.layout;
      return layout ? [[id, { ...layout }] as const] : [];
    }));
    start.current = {
      kind: resizeHandle ? "resize" : "move",
      x: event.clientX,
      y: event.clientY,
      ids: resizeHandle ? [blockId] : ids,
      layouts,
      moved: false,
    };
    root.dataset.transforming = start.current.kind;

    const move = (next: PointerEvent) => {
      const active = start.current;
      if (!active) return;
      const zoom = Number(root.dataset.edgelessZoom) || 1;
      const dx = canvasDelta(next.clientX - active.x, zoom);
      const dy = canvasDelta(next.clientY - active.y, zoom);
      if (!active.moved && Math.hypot(dx, dy) < 2) return;
      active.moved = true;
      if (active.kind === "move") {
        active.ids.forEach((id) => {
          const target = cardFor(root, id);
          if (target) target.style.transform = `translate(${dx}px, ${dy}px)`;
        });
      } else {
        const id = active.ids[0]!;
        const layout = active.layouts.get(id);
        const target = cardFor(root, id);
        if (layout && target) {
          target.style.width = `${Math.max(180, layout.width + dx)}px`;
          target.style.height = `${Math.max(100, layout.height + dy)}px`;
        }
      }
    };

    const finish = (commit: boolean) => {
      const active = start.current;
      if (!active) return;
      const zoom = Number(root.dataset.edgelessZoom) || 1;
      const dx = canvasDelta(lastPointer.x - active.x, zoom);
      const dy = canvasDelta(lastPointer.y - active.y, zoom);
      // Keep the successful resize preview in place. Removing it here can
      // leave a briefly uncontrolled size because React still remembers the
      // preceding persisted style. A canceled gesture restores its snapshot.
      clearPreview(!commit);
      start.current = null;
      cleanupGesture.current();
      if (!commit || !active.moved) return;
      editor.document.transact(() => active.ids.forEach((id) => {
        const layout = active.layouts.get(id);
        if (!layout) return;
        editor.setBlockLayout(id, active.kind === "move"
          ? { x: layout.x + dx, y: layout.y + dy }
          : { width: Math.max(180, layout.width + dx), height: Math.max(100, layout.height + dy) });
      }));
    };

    const lastPointer = { x: event.clientX, y: event.clientY };
    const rememberAndMove = (next: PointerEvent) => {
      lastPointer.x = next.clientX;
      lastPointer.y = next.clientY;
      move(next);
    };
    const stop = (next: PointerEvent) => {
      lastPointer.x = next.clientX;
      lastPointer.y = next.clientY;
      finish(true);
    };
    const cancel = () => finish(false);
    cleanupGesture.current = () => {
      window.removeEventListener("pointermove", rememberAndMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", cancel);
    };
    window.addEventListener("pointermove", rememberAndMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", cancel);
    card.focus({ preventScroll: true });
  }, true);

  useEditorEvent("keydown", (event) => {
    if (event.key !== "Escape" || !start.current) return;
    event.preventDefault();
    clearPreview();
    start.current = null;
    cleanupGesture.current();
  });

  useEffect(() => () => {
    clearPreview();
    cleanupGesture.current();
  }, [root]);

  return null;
}

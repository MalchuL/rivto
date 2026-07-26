import type {
  EdgelessSelection,
  EditorBlockLayout,
} from "@chulane/rivto";
import {
  useDOMEvent,
  useEditor,
  useEditorRoot,
  useKeyboardEvent,
} from "../hooks";
import { useEffect, useRef } from "react";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../events/keymap";
import { canvasDelta } from "./utils/edgeless-geometry";

const ROOT_SELECTOR = "[data-edgeless-root]";

interface TransformStart {
  readonly kind: "move" | "resize";
  readonly x: number;
  readonly y: number;
  readonly ids: string[];
  readonly layouts: Map<string, EditorBlockLayout>;
  lastX: number;
  lastY: number;
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

  useDOMEvent("pointerdown", ({ event }) => {
    if (event.button !== 0 || !(event.target instanceof Element) || !root) return false;
    const moveHandle = event.target.closest("[data-edgeless-drag-handle]");
    const resizeHandle = event.target.closest("[data-edgeless-resize-handle]");
    if (!moveHandle && !resizeHandle) return false;
    const card = event.target.closest<HTMLElement>(ROOT_SELECTOR);
    const blockId = card?.dataset.edgelessRoot;
    if (!card || !blockId) return false;
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
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    };
    root.dataset.transforming = start.current.kind;
    card.focus({ preventScroll: true });
    return true;
  }, { capture: true });

  useDOMEvent("pointermove", ({ event }) => {
      const active = start.current;
      if (!active || !root) return false;
      active.lastX = event.clientX;
      active.lastY = event.clientY;
      const zoom = Number(root.dataset.edgelessZoom) || 1;
      const dx = canvasDelta(event.clientX - active.x, zoom);
      const dy = canvasDelta(event.clientY - active.y, zoom);
      if (!active.moved && Math.hypot(dx, dy) < 2) return false;
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
      return true;
  }, { target: "window", passive: false });

  const finish = (commit: boolean): boolean => {
      const active = start.current;
      if (!active || !root) return false;
      const zoom = Number(root.dataset.edgelessZoom) || 1;
      const dx = canvasDelta(active.lastX - active.x, zoom);
      const dy = canvasDelta(active.lastY - active.y, zoom);
      // Keep the successful resize preview in place. Removing it here can
      // leave a briefly uncontrolled size because React still remembers the
      // preceding persisted style. A canceled gesture restores its snapshot.
      clearPreview(!commit);
      start.current = null;
      if (!commit || !active.moved) return false;
      editor.document.transact(() => active.ids.forEach((id) => {
        const layout = active.layouts.get(id);
        if (!layout) return;
        editor.setBlockLayout(id, active.kind === "move"
          ? { x: layout.x + dx, y: layout.y + dy }
          : { width: Math.max(180, layout.width + dx), height: Math.max(100, layout.height + dy) });
      }));
      return true;
  };

  useDOMEvent("pointerup", ({ event }) => {
    const active = start.current;
    if (active) {
      active.lastX = event.clientX;
      active.lastY = event.clientY;
    }
    return finish(true);
  }, { target: "window" });
  useDOMEvent("pointercancel", () => finish(false), { target: "window" });

  useKeyboardEvent({
    id: KEYBOARD_BINDING_IDS.edgelessTransformCancel,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.edgelessTransformCancel],
    mode: "edgeless",
    when: () => Boolean(start.current),
  }, () => {
    if (!start.current) return false;
    finish(false);
    return true;
  });

  useEffect(() => () => {
    clearPreview();
  }, [root]);

  return null;
}

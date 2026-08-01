import type {
  BlockSelection,
  EditorBlockLayout as BlockLayout,
} from "@chulane/rivto";
import type { ReactEditor } from "../types";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../managers";
import { canvasDelta, owningRootIds } from "./edgeless-geometry";

const ROOT_SELECTOR = "[data-edgeless-root]";

interface TransformStart {
  readonly kind: "move" | "resize";
  readonly x: number;
  readonly y: number;
  readonly ids: string[];
  readonly layouts: Map<string, BlockLayout>;
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
export function registerEdgelessTransform(reactEditor: ReactEditor): () => void {
  const { editor } = reactEditor;
  let start: TransformStart | null = null;

  const clearPreview = (restoreSize = true) => {
    const root = reactEditor.events.getRoot();
    const current = start;
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

  reactEditor.events.register({
    id: "edgeless.transform.pointer-start",
    type: "pointerdown",
    capture: true,
    mode: "edgeless",
  }, ({ raw: event, root }) => {
    if (event.button !== 0 || !(event.target instanceof Element)) return false;
    const moveHandle = event.target.closest("[data-edgeless-drag-handle]");
    const resizeHandle = event.target.closest("[data-edgeless-resize-handle]");
    if (!moveHandle && !resizeHandle) return false;
    const card = event.target.closest<HTMLElement>(ROOT_SELECTOR);
    const blockId = card?.dataset.edgelessRoot;
    if (!card || !blockId) return false;
    event.stopPropagation();

    const current = editor.selection.get().find((item): item is BlockSelection => item.type === "block");
    const selectedRoots = owningRootIds(editor.getBlocks(), current?.blockIds ?? []);
    const ids = moveHandle && selectedRoots.includes(blockId) ? selectedRoots : [blockId];
    if (!selectedRoots.includes(blockId)) {
      editor.selection.set([{
        type: "block",
        blockIds: [blockId],
        anchorBlockId: blockId,
        focusBlockId: blockId,
      }]);
    }
    const roots = new Map(editor.getBlocks().map((block) => [block.id, block]));
    const layouts = new Map(ids.flatMap((id) => {
      const layout = roots.get(id)?.layout;
      return layout ? [[id, { ...layout }] as const] : [];
    }));
    start = {
      kind: resizeHandle ? "resize" : "move",
      x: event.clientX,
      y: event.clientY,
      ids: resizeHandle ? [blockId] : ids,
      layouts,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    };
    root.dataset.transforming = start.kind;
    card.focus({ preventScroll: true });
    return true;
  });

  reactEditor.events.register({
    id: "edgeless.transform.pointer-move",
    type: "pointermove",
    target: "window",
    mode: "edgeless",
    passive: false,
  }, ({ raw: event, root }) => {
      const active = start;
      if (!active) return false;
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
  });

  const finish = (commit: boolean): boolean => {
      const root = reactEditor.events.getRoot();
      const active = start;
      if (!active || !root) return false;
      const zoom = Number(root.dataset.edgelessZoom) || 1;
      const dx = canvasDelta(active.lastX - active.x, zoom);
      const dy = canvasDelta(active.lastY - active.y, zoom);
      // Keep the successful resize preview in place. Removing it here can
      // leave a briefly uncontrolled size because React still remembers the
      // preceding persisted style. A canceled gesture restores its snapshot.
      clearPreview(!commit);
      start = null;
      if (!commit || !active.moved) return false;
      editor.batchUpdates(() => active.ids.forEach((id) => {
        const layout = active.layouts.get(id);
        if (!layout) return;
        editor.setBlockLayout(id, active.kind === "move"
          ? { x: layout.x + dx, y: layout.y + dy }
          : { width: Math.max(180, layout.width + dx), height: Math.max(100, layout.height + dy) });
      }));
      return true;
  };

  reactEditor.events.register({
    id: "edgeless.transform.pointer-end",
    type: "pointerup",
    target: "window",
    mode: "edgeless",
  }, ({ raw: event }) => {
    const active = start;
    if (active) {
      active.lastX = event.clientX;
      active.lastY = event.clientY;
    }
    return finish(true);
  });
  reactEditor.events.register({
    id: "edgeless.transform.pointer-cancel",
    type: "pointercancel",
    target: "window",
    mode: "edgeless",
  }, () => finish(false));

  reactEditor.events.register({
    id: KEYBOARD_BINDING_IDS.edgelessTransformCancel,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.edgelessTransformCancel],
    mode: "edgeless",
    when: () => Boolean(start),
  }, () => {
    if (!start) return false;
    finish(false);
    return true;
  });

  return () => {
    clearPreview();
  };
}

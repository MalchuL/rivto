import type { EditorElementFrame } from "@chulane/rivto";
import type { ReactEditor } from "../../types";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../../managers";
import { canvasDelta } from "./edgeless-geometry";
import { getEdgelessRuntime } from "./edgeless-runtime";
import { blockIdsOf } from "../../surfaces/edgeless/block-elements";

const ROOT_SELECTOR = "[data-edgeless-root]";
const BLOCK_SELECTOR = "[data-block-id]";
const CARD_CONTROL_SELECTOR = [
  "[data-block-content]",
  "[data-edgeless-resize-handle]",
  "[data-edgeless-ui]",
  "button",
  "input",
  "textarea",
  "select",
  "a",
  "[contenteditable=true]",
].join(",");

interface TransformStart {
  readonly kind: "move" | "resize";
  readonly x: number;
  readonly y: number;
  readonly ids: string[];
  readonly layouts: Map<string, EditorElementFrame>;
  lastX: number;
  lastY: number;
  moved: boolean;
}

/** Finds a rendered root card without interpolating an arbitrary ID into CSS. */
function cardFor(root: HTMLElement, id: string): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>(ROOT_SELECTOR)].find((card) => card.dataset.edgelessRoot === id);
}

/**
 * Adds atomic root dragging and resizing through delegated canvas chrome.
 *
 * Pointer movement changes only temporary inline styles. Persisted CRDT layout
 * is patched once on pointer-up, so a grouped gesture is one transaction and
 * one undo item instead of hundreds of pointermove history entries.
 */
export function registerEdgelessTransform(reactEditor: ReactEditor): () => void {
  const { editor } = reactEditor;
  const selection = getEdgelessRuntime(reactEditor);
  let start: TransformStart | null = null;

  const previewIds = (ids: readonly string[]): Set<string> => {
    const result = new Set<string>();
    const visit = (id: string) => {
      if (result.has(id)) return;
      result.add(id);
      const element = editor.elements.getElement(id);
      if (element?.type === "group" && Array.isArray(element.props.children)) {
        element.props.children.forEach((child) => { if (typeof child === "string") visit(child); });
      }
    };
    ids.forEach(visit);
    return result;
  };

  const previewObjects = (root: HTMLElement, ids: readonly string[]): HTMLElement[] => {
    const included = previewIds(ids);
    return [...root.querySelectorAll<HTMLElement>("[data-edgeless-object-id], [data-edgeless-group-bound-id]")]
      .filter((object) => included.has(object.dataset.edgelessObjectId ?? object.dataset.edgelessGroupBoundId ?? ""));
  };

  const clearPreview = (restoreSize = true) => {
    const root = reactEditor.events.getRoot();
    const current = start;
    if (!root || !current) return;
    previewObjects(root, current.ids).forEach((object) => {
      object.style.removeProperty("transform");
      const id = object.dataset.edgelessObjectId ?? object.dataset.edgelessGroupBoundId ?? "";
      const layout = current.layouts.get(id);
      if (current.kind === "resize" && restoreSize && layout) {
        object.style.width = `${layout.width}px`;
        object.style.height = `${layout.height}px`;
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
    const resizeHandle = event.target.closest("[data-edgeless-resize-handle]");
    const card = event.target.closest<HTMLElement>(ROOT_SELECTOR);
    const elementId = card?.dataset.edgelessRoot;
    if (!card || !elementId) return false;
    const hitBlock = event.target.closest<HTMLElement>(BLOCK_SELECTOR);
    const element = editor.elements.getElement(elementId);
    const movableChrome = !event.target.closest(CARD_CONTROL_SELECTOR) &&
      (!hitBlock || element?.type === "block" &&
        blockIdsOf(element, editor.blocks.getRootIds()).includes(hitBlock.dataset.blockId ?? ""));
    if (!resizeHandle && !movableChrome) return false;
    event.stopPropagation();

    const current = selection.get().items;
    const selected = current.includes(elementId);
    if (event.ctrlKey || event.metaKey) {
      selection.set(selected
        ? current.filter((item) => item !== elementId)
        : [...current, elementId]);
      if (selected) return true;
    } else if (!selected) {
      selection.set([elementId]);
    }
    const ids = !resizeHandle && selected ? [...current] : [elementId];
    const kind = resizeHandle ? "resize" : "move";
    const layouts = new Map(ids.flatMap((id) => {
      const frame = editor.elements.getElement(id)?.frame;
      return frame ? [[id, { ...frame }] as const] : [];
    }));
    start = {
      kind,
      x: event.clientX,
      y: event.clientY,
      ids: resizeHandle ? [elementId] : ids,
      layouts,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    };
    root.dataset.transforming = kind;
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
        previewObjects(root, active.ids).forEach((target) => {
          target.style.transform = `translate(${dx}px, ${dy}px)`;
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
      if (active.kind === "move" && editor.commands.has("edgeless.selection.move")) {
        editor.execute(
          "edgeless.selection.move",
          { dx, dy },
        );
        return true;
      }
      editor.batchUpdates(() => active.ids.forEach((id) => {
        const layout = active.layouts.get(id);
        if (!layout) return;
        editor.elements.updateElement(id, { frame: active.kind === "move"
          ? { x: layout.x + dx, y: layout.y + dy }
          : { width: Math.max(180, layout.width + dx), height: Math.max(100, layout.height + dy) } });
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

  reactEditor.keyboard.register({
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

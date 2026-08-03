import { BLOCK_CONTENT_SELECTOR } from "../constants";
import {
  useDOMEvent,
  useEditorMode,
  useEditorRoot,
  useReactEditor,
  useKeyboardEvent,
} from "../hooks";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../managers";
import {
  rootsInRect,
  type EdgelessRect,
} from "./edgeless-geometry";
import {
  getEdgelessRuntime,
  type EdgelessSelectionRef,
} from "./edgeless-runtime";

interface RectangleGesture {
  readonly x: number;
  readonly y: number;
  readonly base: readonly EdgelessSelectionRef[];
  moved: boolean;
}

const ROOT_SELECTOR = "[data-edgeless-root]";
const OBJECT_SELECTOR = "[data-edgeless-object-kind][data-edgeless-object-id]";
const HANDLE_SELECTOR = "[data-edgeless-drag-handle], [data-edgeless-resize-handle]";

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
  const reactEditor = useReactEditor();
  const selection = getEdgelessRuntime(reactEditor);
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
    const object = event.target.closest<HTMLElement>(OBJECT_SELECTOR);
    const objectId = object?.dataset.edgelessObjectId;
    const objectKind = object?.dataset.edgelessObjectKind as EdgelessSelectionRef["kind"] | undefined;
    const primary = event.ctrlKey || event.metaKey;

    if (object && objectId && objectKind && objectKind !== "block") {
      const current = selection.get().items;
      const exists = current.some((item) => item.kind === objectKind && item.id === objectId);
      selection.set(primary
        ? exists ? current.filter((item) => !(item.kind === objectKind && item.id === objectId)) : [...current, { kind: objectKind, id: objectId }]
        : [{ kind: objectKind, id: objectId }]);
      root.ownerDocument.getSelection()?.removeAllRanges();
      if (primary) event.stopPropagation();
      return primary;
    }

    if (card && blockId && primary && !isInteractive(event.target)) {
      const current = selection.get().items;
      const exists = current.some((item) => item.kind === "block" && item.id === blockId);
      selection.set(exists
        ? current.filter((item) => !(item.kind === "block" && item.id === blockId))
        : [...current, { kind: "block", id: blockId }]);
      root.ownerDocument.getSelection()?.removeAllRanges();
      card.focus({ preventScroll: true });
      return true;
    }

    if (card) {
      if (isInteractive(event.target)) return false;
      selection.set(blockId ? [{ kind: "block", id: blockId }] : []);
      card.focus({ preventScroll: true });
      return true;
    }

    if (event.target.closest(".edgeless-zoom-controls, .edgeless-visual-toolbar, .edgeless-drawing-capture[data-active]")) return false;
    root.focus({ preventScroll: true });
    if (!primary) selection.clear();
    gesture.current = {
      x: event.clientX,
      y: event.clientY,
      base: primary ? selection.get().items : [],
      moved: false,
    };
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
    const objects = [...root.querySelectorAll<HTMLElement>(OBJECT_SELECTOR)].flatMap((element) => {
      const id = element.dataset.edgelessObjectId;
      const kind = element.dataset.edgelessObjectKind as EdgelessSelectionRef["kind"] | undefined;
      return id && kind && kind !== "group" ? [{ id: `${kind}:${id}`, rect: element.getBoundingClientRect() }] : [];
    });
    const intersecting = rootsInRect(objects, next).map((value) => {
      const separator = value.indexOf(":");
      return { kind: value.slice(0, separator) as EdgelessSelectionRef["kind"], id: value.slice(separator + 1) };
    });
    selection.set([...start.base, ...intersecting]);
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
    when: ({ root }) =>
      !root.dataset.transforming &&
      selection.get().active && selection.get().items.length > 0,
  }, () => {
    if (!root) return false;
    if (!selection.get().items.length) return false;
    selection.clear();
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

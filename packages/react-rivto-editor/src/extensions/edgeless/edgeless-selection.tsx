import { BLOCK_CONTENT_SELECTOR } from "../../constants";
import {
  useDOMEvent,
  useEditorMode,
  useEditorRoot,
  useReactEditor,
  useKeyboardEvent,
} from "../../hooks";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../../managers";
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
const HANDLE_SELECTOR = "[data-edgeless-resize-handle], [data-edgeless-rotation-handle]";

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
    if (root.dataset.panningReady === "true" || root.dataset.edgelessTool === "pan") return false;
    if (event.target.closest(HANDLE_SELECTOR)) return false;
    const card = event.target.closest<HTMLElement>(ROOT_SELECTOR);
    const elementId = card?.dataset.edgelessRoot;
    const object = event.target.closest<HTMLElement>(OBJECT_SELECTOR);
    const objectId = object?.dataset.edgelessObjectId;
    const primary = event.ctrlKey || event.metaKey;
    let handled = true;

    if (object && objectId && !card) {
      const current = selection.get().items;
      const exists = current.includes(objectId);
      selection.set(primary
        ? exists ? current.filter((item) => item !== objectId) : [...current, objectId]
        : exists ? current : [objectId]);
      root.ownerDocument.getSelection()?.removeAllRanges();
      if (primary) event.stopPropagation();
      handled = primary;
    } else if (card && elementId && primary && !isInteractive(event.target)) {
      const current = selection.get().items;
      const exists = current.includes(elementId);
      selection.set(exists
        ? current.filter((item) => item !== elementId)
        : [...current, elementId]);
      root.ownerDocument.getSelection()?.removeAllRanges();
      card.focus({ preventScroll: true });
    } else if (card) {
      if (isInteractive(event.target)) handled = false;
      else {
        const current = selection.get().items;
        selection.set(elementId ? current.includes(elementId) ? current : [elementId] : []);
        card.focus({ preventScroll: true });
      }
    } else if (event.target.closest("[data-edgeless-ui], .edgeless-drawing-capture[data-active]")) {
      handled = false;
    } else {
      root.focus({ preventScroll: true });
      if (!primary) selection.clear();
      gesture.current = {
        x: event.clientX,
        y: event.clientY,
        base: primary ? selection.get().items : [],
        moved: false,
      };
    }
    return handled;
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
    const editor = reactEditor.editor;
    const parentOf = (id: string): string | undefined =>
      editor.elements.getElements().find((element) =>
        element.type === "group"
        && Array.isArray(element.props.children)
        && element.props.children.includes(id),
      )?.id;
    const topLevel = (id: string): string => {
      let current = id;
      for (let parent = parentOf(current); parent; parent = parentOf(current)) current = parent;
      return current;
    };
    // Dedupe DOM hits (group hit + outline share an id) and lift children to their
    // outermost group so marquee can select an existing group + siblings to re-group.
    const seen = new Set<string>();
    const objects = [...root.querySelectorAll<HTMLElement>(OBJECT_SELECTOR)].flatMap((element) => {
      const id = element.dataset.edgelessObjectId;
      if (!id || seen.has(id)) return [];
      seen.add(id);
      return [{ id, rect: element.getBoundingClientRect() }];
    });
    const intersecting = [...new Set(rootsInRect(objects, next).map(topLevel))];
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

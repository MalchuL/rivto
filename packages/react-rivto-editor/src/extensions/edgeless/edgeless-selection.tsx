/**
 * Pointer gestures for whole-object edgeless selection, including marquee.
 *
 * The marquee rectangle is a DOM node updated from pointermove without React
 * state. Object rects and the group-parent index are captured once when the
 * gesture crosses slop so later moves only intersect and call `selection.set`,
 * which no-ops when membership is unchanged.
 */
import { BLOCK_CONTENT_SELECTOR } from "../../constants";
import {
  useDOMEvent,
  useEditorMode,
  useEditorRoot,
  useReactEditor,
  useKeyboardEvent,
} from "../../hooks";
import { useEffect, useRef } from "react";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../../managers";
import {
  groupParentByChild,
  outermostGroupId,
  rootsInRect,
  type EdgelessObjectHit,
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
  objects: readonly EdgelessObjectHit[];
  parentByChild: ReadonlyMap<string, string>;
}

const ROOT_SELECTOR = "[data-edgeless-root]";
const OBJECT_SELECTOR = "[data-edgeless-object-kind][data-edgeless-object-id]";
const HANDLE_SELECTOR = "[data-edgeless-resize-handle], [data-edgeless-rotation-handle]";
const RECTANGLE_CLASS = "edgeless-selection-rectangle";
const MARQUEE_SLOP_PX = 3;

/**
 * Returns true for controls that retain their normal interaction without Primary.
 *
 * @param target - Event target under the pointer.
 * @returns True when the target is editable content or a native control.
 */
function isInteractive(target: Element): boolean {
  return Boolean(target.closest(`${BLOCK_CONTENT_SELECTOR}, input, textarea, select, button, a`));
}

/**
 * Captures unique object IDs and viewport rects for one marquee gesture.
 *
 * @param root - Edgeless viewport that owns rendered canvas objects.
 * @returns Deduped hits in query order.
 */
function snapshotObjectHits(root: HTMLElement): EdgelessObjectHit[] {
  const seen = new Set<string>();
  const objects: EdgelessObjectHit[] = [];
  for (const element of root.querySelectorAll<HTMLElement>(OBJECT_SELECTOR)) {
    const id = element.dataset.edgelessObjectId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const box = element.getBoundingClientRect();
    objects.push({
      id,
      rect: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
    });
  }
  return objects;
}

/**
 * Creates or returns the persistent marquee node on `document.body`.
 *
 * @param doc - Owner document for the overlay.
 * @param node - Previously created node, if any.
 * @returns Live marquee element, hidden until painted.
 */
function ensureRectangle(doc: Document, node: HTMLElement | null): HTMLElement {
  if (node) return node;
  const next = doc.createElement("div");
  next.className = RECTANGLE_CLASS;
  next.dataset.edgelessSelectionRectangle = "true";
  next.style.display = "none";
  doc.body.appendChild(next);
  return next;
}

/**
 * Writes marquee geometry onto the overlay node.
 *
 * @param node - Persistent marquee element.
 * @param rect - Inclusive viewport rectangle for this pointer sample.
 * @returns Nothing.
 */
function paintRectangle(node: HTMLElement, rect: EdgelessRect): void {
  node.style.display = "block";
  node.style.left = `${rect.left}px`;
  node.style.top = `${rect.top}px`;
  node.style.width = `${rect.right - rect.left}px`;
  node.style.height = `${rect.bottom - rect.top}px`;
}

/**
 * Hides the marquee overlay without unmounting it.
 *
 * @param node - Persistent marquee element, if created.
 * @returns Nothing.
 */
function hideRectangle(node: HTMLElement | null): void {
  if (!node) return;
  node.style.display = "none";
}

/**
 * Owns whole-block selection on the edgeless canvas.
 *
 * Primary-click can select any nested BlockView. Card-background and rectangle
 * gestures select root cards because only roots are independent canvas
 * objects. Layout extensions project arbitrary selected blocks back to their
 * owning roots when a canvas move is requested.
 *
 * @returns Null; the marquee rectangle is an imperative DOM node.
 */
export function EdgelessInteractionOverlay() {
  const reactEditor = useReactEditor();
  const selection = getEdgelessRuntime(reactEditor);
  const { mode } = useEditorMode();
  const { element: root } = useEditorRoot();
  const gesture = useRef<RectangleGesture | null>(null);
  const rectangleRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    return () => {
      rectangleRef.current?.remove();
      rectangleRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (mode === "edgeless") return;
    gesture.current = null;
    hideRectangle(rectangleRef.current);
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
        objects: [],
        parentByChild: new Map(),
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
    if (!start.moved && Math.hypot(event.clientX - start.x, event.clientY - start.y) < MARQUEE_SLOP_PX) return false;
    if (!start.moved) {
      start.moved = true;
      start.objects = snapshotObjectHits(root);
      start.parentByChild = groupParentByChild(reactEditor.editor.elements.getElements());
    }
    const next = {
      left: Math.min(start.x, event.clientX),
      top: Math.min(start.y, event.clientY),
      right: Math.max(start.x, event.clientX),
      bottom: Math.max(start.y, event.clientY),
    };
    const node = ensureRectangle(root.ownerDocument, rectangleRef.current);
    rectangleRef.current = node;
    paintRectangle(node, next);
    // Dedupe DOM hits (group hit + outline share an id) and lift children to their
    // outermost group so marquee can select an existing group + siblings to re-group.
    const intersecting = [...new Set(
      rootsInRect(start.objects, next).map((id) => outermostGroupId(id, start.parentByChild)),
    )];
    selection.set([...start.base, ...intersecting]);
    return true;
  });

  /**
   * Ends an in-progress marquee without claiming the pointerup for other handlers.
   *
   * @returns False so later listeners still see the event.
   */
  const stopRectangle = (): boolean => {
    if (!gesture.current) return false;
    gesture.current = null;
    hideRectangle(rectangleRef.current);
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

  return null;
}

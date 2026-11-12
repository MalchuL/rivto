import {
  useEffect,
  useMemo,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { PREVENT_TEXT_EDITING_ATTRIBUTE } from "../../constants";

/**
 * Props for an interactive child that handles its own pointer-driven editing.
 *
 * Stopping propagation keeps an ancestor preview from switching the complete
 * block to raw-text mode. The marker also gives delegated extensions a stable
 * way to recognize the same opt-out without depending on component classes.
 */
export interface PreventTextEditingAttributes {
  readonly [PREVENT_TEXT_EDITING_ATTRIBUTE]: "";
  readonly onPointerDown: NonNullable<HTMLAttributes<HTMLElement>["onPointerDown"]>;
}

/**
 * Tracks one editable child's native pointer selection until it ends or is cancelled.
 *
 * The returned cleanup removes every window listener and informs the owner so it
 * can release its reference. Pointer events from other pointers are ignored.
 *
 * @param target - Editable child receiving the selection.
 * @param selection - Document selection updated by this gesture.
 * @param anchor - Initial caret position within the editable child.
 * @param pointerId - Pointer whose movement and completion belong to this gesture.
 * @param view - Window receiving pointer and blur events.
 * @param onCleanup - Callback receiving this gesture's cleanup after listeners are removed.
 * @returns A cleanup that removes the gesture's listeners.
 */
function trackPointerSelection(
  target: HTMLElement,
  selection: Selection,
  anchor: CaretPosition,
  pointerId: number,
  view: Window,
  onCleanup: (cleanup: () => void) => void,
): () => void {
  const document = target.ownerDocument;
  let focus = anchor;
  const extend = (move: PointerEvent) => {
    if (move.pointerId !== pointerId) {
      return;
    }
    const next = document.caretPositionFromPoint?.(move.clientX, move.clientY);
    if (!next || !target.contains(next.offsetNode)) {
      return;
    }
    focus = next;
    selection.setBaseAndExtent(anchor.offsetNode, anchor.offset, next.offsetNode, next.offset);
  };
  const cleanup = (): void => {
    view.removeEventListener("pointermove", extend);
    view.removeEventListener("pointerup", finish);
    view.removeEventListener("pointercancel", finish);
    view.removeEventListener("blur", cleanup);
    onCleanup(cleanup);
  };
  const finish = (end: PointerEvent) => {
    if (end.pointerId !== pointerId) {
      return;
    }
    cleanup();
    target.focus({ preventScroll: true });
    selection.setBaseAndExtent(anchor.offsetNode, anchor.offset, focus.offsetNode, focus.offset);
  };
  view.addEventListener("pointermove", extend);
  view.addEventListener("pointerup", finish);
  view.addEventListener("pointercancel", finish);
  view.addEventListener("blur", cleanup);
  return cleanup;
}

/**
 * Starts a selection gesture when pointer hit-testing reaches an editable child.
 *
 * A previous gesture is cancelled only when a new gesture can be tracked. Native
 * selection remains untouched when hit-testing does not reach the editable child.
 *
 * @param event - Pointer down event on the nested control.
 * @param cancelPrevious - Removes listeners from the previous tracked gesture.
 * @param onCleanup - Callback receiving the new gesture's cleanup when it ends.
 * @returns Cleanup for the new gesture, or undefined when no gesture is tracked.
 */
function startPointerSelection(
  event: ReactPointerEvent<HTMLElement>,
  cancelPrevious: () => void,
  onCleanup: (cleanup: () => void) => void,
): (() => void) | undefined {
  event.stopPropagation();
  const target = event.currentTarget;
  if (!target.isContentEditable) {
    return undefined;
  }
  const document = target.ownerDocument;
  const selection = document.getSelection();
  const anchor = document.caretPositionFromPoint?.(event.clientX, event.clientY);
  if (!selection || !anchor || !target.contains(anchor.offsetNode)) {
    return undefined;
  }
  // This hook owns the editable child's selection gesture. Prevent the
  // browser from running a second rich-content selection over highlighted DOM.
  // If hit-testing resolves the highlighted sibling instead, retain native
  // focus and selection rather than preventing a gesture we cannot restore.
  event.preventDefault();
  target.focus({ preventScroll: true });
  selection.setBaseAndExtent(anchor.offsetNode, anchor.offset, anchor.offsetNode, anchor.offset);
  const view = document.defaultView;
  if (!view) {
    return undefined;
  }
  cancelPrevious();
  return trackPointerSelection(target, selection, anchor, event.pointerId, view, onCleanup);
}

/**
 * Gives nested controls their own pointer gestures without activating raw block editing.
 *
 * Temporary window listeners are removed when the gesture ends, the window loses
 * focus, or the component unmounts.
 *
 * @returns Stable opt-out attributes for the nested control.
 */
export function usePreventTextEditing(): PreventTextEditingAttributes {
  const interaction = useMemo(() => {
    let pointerCleanup: (() => void) | undefined;
    /**
     * Gives a nested editable its own pointer selection without activating the parent.
     *
     * @param event - Pointer down event on the nested control.
     * @returns A valid selection gesture is tracked until it ends or is cancelled.
     */
    const onPointerDown: NonNullable<HTMLAttributes<HTMLElement>["onPointerDown"]> = (event) => {
      const cleanup = startPointerSelection(
        event,
        () => pointerCleanup?.(),
        (cleanup) => {
          if (pointerCleanup === cleanup) {
            pointerCleanup = undefined;
          }
        },
      );
      if (cleanup) {
        pointerCleanup = cleanup;
      }
    };

    return {
      attributes: { [PREVENT_TEXT_EDITING_ATTRIBUTE]: "" as const, onPointerDown },
      /**
       * Releases listeners from a nested editable's pointer gesture.
       *
       * @returns Any active gesture listeners have been removed.
       */
      destroy: () => {
        pointerCleanup?.();
        pointerCleanup = undefined;
      },
    };
  }, []);
  useEffect(() => interaction.destroy, [interaction]);
  return interaction.attributes;
}

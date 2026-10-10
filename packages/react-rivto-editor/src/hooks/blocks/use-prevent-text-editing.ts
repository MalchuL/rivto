import { useEffect, useMemo, type HTMLAttributes } from "react";
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
 * Gives nested controls their own pointer gestures without activating raw block editing.
 * @returns Stable opt-out attributes; temporary window listeners are removed on unmount.
 */
export function usePreventTextEditing(): PreventTextEditingAttributes {
  const interaction = useMemo(() => {
    let pointerCleanup: (() => void) | undefined;
    /** Gives a nested editable its own pointer selection without activating the parent. */
    const onPointerDown: NonNullable<HTMLAttributes<HTMLElement>["onPointerDown"]> = (event) => {
      event.stopPropagation();
      const target = event.currentTarget;
      if (!target.isContentEditable) return;
      const document = target.ownerDocument;
      const selection = document.getSelection();
      const anchor = document.caretPositionFromPoint?.(event.clientX, event.clientY);
      if (!selection || !anchor || !target.contains(anchor.offsetNode)) return;
      // This hook owns the editable child's selection gesture. Prevent the
      // browser from running a second rich-content selection over highlighted DOM.
      // If hit-testing resolves the highlighted sibling instead, retain native
      // focus and selection rather than preventing a gesture we cannot restore.
      event.preventDefault();
      target.focus({ preventScroll: true });
      selection.setBaseAndExtent(
        anchor.offsetNode,
        anchor.offset,
        anchor.offsetNode,
        anchor.offset,
      );

      const view = document.defaultView;
      if (!view) return;
      const pointerId = event.pointerId;
      let focus = anchor;
      pointerCleanup?.();
      const extend = (move: PointerEvent) => {
        if (move.pointerId !== pointerId) return;
        const next = document.caretPositionFromPoint?.(move.clientX, move.clientY);
        if (!next || !target.contains(next.offsetNode)) return;
        focus = next;
        selection.setBaseAndExtent(
          anchor.offsetNode,
          anchor.offset,
          next.offsetNode,
          next.offset,
        );
      };
      const cleanup = (): void => {
        view.removeEventListener("pointermove", extend);
        view.removeEventListener("pointerup", finish);
        view.removeEventListener("pointercancel", finish);
        if (pointerCleanup === cleanup) pointerCleanup = undefined;
      };
      const finish = (end: PointerEvent) => {
        if (end.pointerId !== pointerId) return;
        cleanup();
        target.focus({ preventScroll: true });
        selection.setBaseAndExtent(
          anchor.offsetNode,
          anchor.offset,
          focus.offsetNode,
          focus.offset,
        );
      };
      pointerCleanup = cleanup;
      view.addEventListener("pointermove", extend);
      view.addEventListener("pointerup", finish);
      view.addEventListener("pointercancel", finish);
    };

    return {
      attributes: { [PREVENT_TEXT_EDITING_ATTRIBUTE]: "" as const, onPointerDown },
      /** Releases listeners from a nested editable's pointer gesture. */
      destroy: () => { pointerCleanup?.(); pointerCleanup = undefined; },
    };
  }, []);
  useEffect(() => interaction.destroy, [interaction]);
  return interaction.attributes;
}

import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
  type MutableRefObject,
} from "react";
import { placeCaretAtPoint } from "./place-caret-at-point";

/** Viewport point used to place the caret when editing becomes active. */
export interface EditableLabelFocusPoint {
  readonly x: number;
  readonly y: number;
}

/** Imperative API for entering edit mode at a pointer position. */
export interface EditableLabelHandle {
  /**
   * Turns editing on and places the caret nearest to the given viewport point.
   *
   * Prefer this when the label is already mounted. If the label mounts only
   * after `editing` becomes true, set {@link EditableLabelProps.focusPointRef}
   * before flipping `editing` instead.
   */
  beginEditingAt(clientX: number, clientY: number): void;
}

export interface EditableLabelProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "contentEditable" | "onBlur" | "children" | "suppressContentEditableWarning"
> {
  /** Whether the label is currently an editing host. */
  readonly editing: boolean;
  /** Publishes editing changes from blur or {@link EditableLabelHandle.beginEditingAt}. */
  readonly onEditingChange: (editing: boolean) => void;
  /** Persisted plain-text content rendered while idle and seeded into the editor. */
  readonly text: string;
  /** Called with the editable's plain text when editing ends. */
  readonly onCommit: (text: string) => void;
  /**
   * Optional point captured before `editing` becomes true.
   *
   * Useful when the label is mounted only while editing (empty shape/connector
   * labels). The ref is cleared after the caret is placed.
   */
  readonly focusPointRef?: MutableRefObject<EditableLabelFocusPoint | null>;
  /**
   * When true, pointerdown while editing stops propagation so canvas drag /
   * selection handlers do not steal the gesture.
   */
  readonly stopPointerWhileEditing?: boolean;
}

/**
 * Shared plain-text label editor for edgeless visuals (text, sticky, shape and
 * connector labels).
 *
 * Double-click-to-edit usually enables `contentEditable` only after the
 * activating event. Focusing then leaves the caret at the first character.
 * Capture the pointer coordinates and either call
 * {@link EditableLabelHandle.beginEditingAt} (label already mounted) or write
 * them to {@link EditableLabelProps.focusPointRef} before setting `editing`.
 */
export const EditableLabel = forwardRef<EditableLabelHandle, EditableLabelProps>(
  function EditableLabel(
    {
      editing,
      onEditingChange,
      text,
      onCommit,
      focusPointRef,
      stopPointerWhileEditing = false,
      className,
      onPointerDown,
      ...attributes
    },
    ref,
  ) {
    const elementRef = useRef<HTMLDivElement | null>(null);
    const pendingCaret = useRef<EditableLabelFocusPoint | null>(null);

    useImperativeHandle(ref, () => ({
      beginEditingAt(clientX, clientY) {
        pendingCaret.current = { x: clientX, y: clientY };
        onEditingChange(true);
      },
    }), [onEditingChange]);

    useLayoutEffect(() => {
      if (!editing) return;
      const element = elementRef.current;
      if (!element) return;
      const point = pendingCaret.current ?? focusPointRef?.current ?? null;
      pendingCaret.current = null;
      if (focusPointRef) focusPointRef.current = null;
      if (point) placeCaretAtPoint(element, point.x, point.y);
      else element.focus({ preventScroll: true });
    }, [editing, focusPointRef]);

    return (
      <div
        {...attributes}
        ref={elementRef}
        className={className}
        contentEditable={editing}
        suppressContentEditableWarning
        onBlur={(event) => {
          onCommit(event.currentTarget.textContent ?? "");
          onEditingChange(false);
        }}
        onPointerDown={(event) => {
          if (editing && stopPointerWhileEditing) event.stopPropagation();
          onPointerDown?.(event);
        }}
      >
        {text}
      </div>
    );
  },
);

/**
 * Shared plain-text label editor for edgeless visuals (text, sticky, shape and
 * connector labels).
 *
 * Double-click-to-edit usually enables `contentEditable` only after the
 * activating event. Focusing then leaves the caret at the first character.
 * Capture the pointer coordinates and either call
 * {@link EditableLabelHandle.beginEditingAt} (label already mounted) or write
 * them to {@link EditableLabelProps.focusPointRef} before setting `editing`.
 *
 * Enter must become a real `\n`. The browser default (`<div>` / `<br>`) is
 * invisible to `textContent`, and connector labels use `white-space: pre`
 * (manual newlines only), so that path looks like Enter is ignored. Paste
 * inserts `text/plain` so structured clipboard cannot retarget a previous
 * block or spawn a new visual. The live DOM is not React children while
 * editing, so a parent re-render cannot wipe an in-progress line break.
 */
import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
  type MutableRefObject,
} from "react";
import {
  insertEditableNewline,
  insertEditablePlainText,
  isEditableNewlineInput,
  readEditablePlainText,
} from "./editable-label-text";
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
 * Renders one plain-text visual label and optionally turns it into an editor.
 *
 * @param props - Label text, editing flags, and native host attributes.
 * @returns A contenteditable host when `editing` is true.
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
      onKeyDown,
      onBeforeInput,
      onPaste,
      ...attributes
    },
    ref,
  ) {
    const elementRef = useRef<HTMLDivElement | null>(null);
    const pendingCaret = useRef<EditableLabelFocusPoint | null>(null);
    const editingSession = useRef(false);
    // keydown runs before beforeinput; remember we already inserted for this Enter.
    const enterInsertedNewline = useRef(false);

    useImperativeHandle(ref, () => ({
      beginEditingAt(clientX, clientY) {
        pendingCaret.current = { x: clientX, y: clientY };
        onEditingChange(true);
      },
    }), [onEditingChange]);

    useLayoutEffect(() => {
      const element = elementRef.current;
      if (!element) return;

      if (!editing) {
        editingSession.current = false;
        if (element.textContent !== text) element.textContent = text;
        return;
      }

      const entering = !editingSession.current;
      editingSession.current = true;
      // Seed once per session. Rewriting on later renders would drop typed `\n`.
      if (entering && element.textContent !== text) element.textContent = text;

      const point = pendingCaret.current ?? focusPointRef?.current ?? null;
      pendingCaret.current = null;
      if (focusPointRef) focusPointRef.current = null;
      if (point) placeCaretAtPoint(element, point.x, point.y);
      else if (entering) element.focus({ preventScroll: true });
    }, [editing, focusPointRef, text]);

    return (
      <div
        {...attributes}
        ref={elementRef}
        className={className}
        contentEditable={editing}
        suppressContentEditableWarning
        onBlur={(event) => {
          onCommit(readEditablePlainText(event.currentTarget));
          onEditingChange(false);
        }}
        onBeforeInput={(event) => {
          onBeforeInput?.(event);
          if (event.defaultPrevented || !editing || event.nativeEvent.isComposing) return;
          if (!isEditableNewlineInput(event.nativeEvent.inputType)) return;
          event.preventDefault();
          if (enterInsertedNewline.current) {
            enterInsertedNewline.current = false;
            return;
          }
          insertEditableNewline(event.currentTarget);
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.key !== "Enter") enterInsertedNewline.current = false;
          if (event.defaultPrevented || !editing || event.nativeEvent.isComposing) return;
          if (event.key !== "Enter") return;
          // Replace insertParagraph so commit can persist a real newline character.
          event.preventDefault();
          insertEditableNewline(event.currentTarget);
          enterInsertedNewline.current = true;
        }}
        onPaste={(event) => {
          onPaste?.(event);
          if (event.defaultPrevented || !editing) return;
          // Structured clipboard must not steal this paste; insert visible text.
          event.preventDefault();
          insertEditablePlainText(
            event.currentTarget,
            event.clipboardData?.getData("text/plain") ?? "",
          );
        }}
        onPointerDown={(event) => {
          if (editing && stopPointerWhileEditing) event.stopPropagation();
          onPointerDown?.(event);
        }}
      />
    );
  },
);

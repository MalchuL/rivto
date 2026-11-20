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
import { forwardRef, useImperativeHandle, useRef } from "react";
import { useReactPanelContext } from "../hooks/editor/use-react-panel-context";
import type { EditableLabelHandle, EditableLabelProps } from "./types";
import { createLabelInputHandlers } from "./editable-label/browser/label-input-handlers";
import { useEditableLabelSession } from "./editable-label/use-editable-label-session";

/**
 * Renders one plain-text visual label and optionally turns it into an editor.
 *
 * @param props - Label text, editing flags, and host callbacks.
 * @param props.editing - Whether the label currently accepts text editing.
 * @param props.onEditingChange - Receives requests to enter or leave editing.
 * @param props.text - Persisted text used to seed each editing session.
 * @param props.onCommit - Receives plain text when editing ends.
 * @param props.focusPointRef - Optional pending viewport point for caret placement.
 * @param props.stopPointerWhileEditing - Whether editing pointer presses stop propagation.
 * @param props.className - Optional presentation class for the label host.
 * @param ref - Receives the imperative request for editing at a viewport point.
 * @returns A contenteditable host when `editing` is true.
 * @throws If rendered outside an EditorPanel or browser editing operations fail.
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
    },
    ref,
  ) {
    const { reactPanel } = useReactPanelContext();
    const { labelRef, pendingCaret, draft } = useEditableLabelSession({
      reactPanel,
      editing,
      text,
      focusPointRef,
    });
    // keydown runs before beforeinput; remember we already inserted for this Enter.
    const enterInsertedNewline = useRef(false);

    const handlers = createLabelInputHandlers({
      panel: reactPanel,
      editing,
      onCommit,
      onEditingChange,
      stopPointerWhileEditing,
      draft,
      enterInsertedNewline,
    });

    useImperativeHandle(
      ref,
      () => ({
        /**
         * Enters label editing and records the client-coordinate caret position for the next render.
         *
         * @param clientX - Caret position in viewport pixels along the horizontal axis.
         * @param clientY - Caret position in viewport pixels along the vertical axis.
         */
        beginEditingAt(clientX, clientY) {
          pendingCaret.current = { x: clientX, y: clientY };
          onEditingChange(true);
        },
      }),
      [onEditingChange],
    );

    return (
      <div
        ref={labelRef}
        className={className}
        contentEditable={editing}
        suppressContentEditableWarning
        {...handlers}
      />
    );
  },
);

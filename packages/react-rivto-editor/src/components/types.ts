import type { MutableRefObject } from "react";
import type { EditableText } from "@chulane/rivto-root";

/** Root text operations borrowed by a visual label. */
export type EditableLabelText = Pick<
  EditableText,
  "isCurrent" | "readRenderedText" | "insertText" | "synchronize"
>;

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
   *
   * @param clientX - Horizontal viewport coordinate in CSS pixels.
   * @param clientY - Vertical viewport coordinate in CSS pixels.
   * @returns Editing has been requested with this pending caret position.
   * @throws Propagates the host editing callback's failure.
   */
  beginEditingAt(clientX: number, clientY: number): void;
}

/** Named text and interaction contract for one visual label editor. */
export interface EditableLabelProps {
  /** Optional presentation class applied to the label host. */
  readonly className?: string;
  /** Whether the label is currently an editing host. */
  readonly editing: boolean;
  /**
   * Publishes editing changes from blur or {@link EditableLabelHandle.beginEditingAt}.
   *
   * @param editing - Whether the host should enter editing mode.
   * @returns The host has received the editing-state request.
   */
  readonly onEditingChange: (editing: boolean) => void;
  /** Persisted plain-text content rendered while idle and seeded into the editor. */
  readonly text: string;
  /**
   * Publishes the editable's plain text when editing ends.
   *
   * @param text - Current label text with line breaks preserved.
   * @returns The host has received the completed text.
   */
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

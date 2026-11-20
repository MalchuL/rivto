import type {
  ClipboardEvent,
  FocusEvent,
  FormEvent,
  HTMLAttributes,
  InputEvent,
  KeyboardEvent,
  PointerEvent,
} from "react";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import type { RegionIdentity } from "@chulane/rivto-root";
import { isEditableNewlineInput } from "../../editable-label-text";
import { captureLabelText } from "./capture-label-text";
import type { EditableLabelInputOptions } from "../types";

/**
 * Translates React label input into Root text operations and host callbacks.
 *
 * Native events stay in this rendering adapter and are never retained.
 *
 * @param options - Current editing state, borrowed Root access, and draft callbacks.
 * @returns React attributes for the mounted contenteditable label.
 */
export function createLabelInputHandlers(
  options: EditableLabelInputOptions,
): Pick<
  HTMLAttributes<HTMLDivElement>,
  "onBlur" | "onInput" | "onBeforeInput" | "onKeyDown" | "onPaste" | "onPointerDown"
> {
  return {
    onBlur: (event) => commitLabel(options, event),
    onInput: (event) => rememberLabelInput(options, event),
    onBeforeInput: (event) => insertLabelBeforeInput(options, event),
    onKeyDown: (event) => insertLabelNewlineOnEnter(options, event),
    onPaste: (event) => pasteLabelText(options, event),
    onPointerDown: (event) => stopLabelPointer(options, event),
  };
}

/**
 * Commits the current owned text or the last owned draft on blur.
 *
 * @param options - Current draft, Root access, and host callbacks.
 * @param event - React focus delivery at the mounted label.
 * @returns The host receives the completed text and editing is closed.
 * @throws Propagates Root text and host callback failures.
 */
function commitLabel(options: EditableLabelInputOptions, event: FocusEvent<HTMLDivElement>): void {
  const text = captureLabelText(
    options.panel,
    getBrowserElementIdentity(event.currentTarget),
  )?.readRenderedText();
  options.onCommit(text ?? options.draft.current);
  options.onEditingChange(false);
}

/**
 * Retains the latest owned draft after browser input.
 *
 * @param options - Borrowed Root access and draft state.
 * @param event - React input delivery at the mounted label.
 * @returns The draft is updated while the occurrence remains current.
 * @throws Propagates Root text-read failures.
 */
function rememberLabelInput(
  options: EditableLabelInputOptions,
  event: FormEvent<HTMLDivElement>,
): void {
  const text = captureLabelText(
    options.panel,
    getBrowserElementIdentity(event.currentTarget),
  )?.readRenderedText();
  if (text !== undefined) {
    options.draft.current = text;
  }
}

/**
 * Replaces a browser paragraph insertion with a plain newline.
 *
 * @param options - Current editing state, Root access, and draft.
 * @param event - React before-input delivery and its browser input type.
 * @returns An eligible newline is inserted once unless keydown already inserted it.
 * @throws Propagates Root text insertion failures.
 */
function insertLabelBeforeInput(
  options: EditableLabelInputOptions,
  event: InputEvent<HTMLDivElement>,
): void {
  if (event.defaultPrevented || !options.editing || event.nativeEvent.isComposing) {
    return;
  }
  if (!isEditableNewlineInput(event.nativeEvent.inputType)) {
    return;
  }
  event.preventDefault();
  if (options.enterInsertedNewline.current) {
    options.enterInsertedNewline.current = false;
    return;
  }
  insertLabelText(options, getBrowserElementIdentity(event.currentTarget), "\n");
}

/**
 * Replaces Enter with a plain newline while preserving composition.
 *
 * @param options - Current editing state, Root access, and draft.
 * @param event - React keyboard delivery at the mounted label.
 * @returns Eligible Enter is prevented and inserted once as plain text.
 * @throws Propagates Root text insertion failures.
 */
function insertLabelNewlineOnEnter(
  options: EditableLabelInputOptions,
  event: KeyboardEvent<HTMLDivElement>,
): void {
  if (event.key !== "Enter") {
    options.enterInsertedNewline.current = false;
  }
  if (event.defaultPrevented || !options.editing || event.nativeEvent.isComposing) {
    return;
  }
  if (event.key !== "Enter") {
    return;
  }
  // Replace insertParagraph so commit can persist a real newline character.
  event.preventDefault();
  insertLabelText(options, getBrowserElementIdentity(event.currentTarget), "\n");
  options.enterInsertedNewline.current = true;
}

/**
 * Inserts clipboard plain text into the current label selection.
 *
 * @param options - Current editing state, Root access, and draft.
 * @param event - React clipboard delivery at the mounted label.
 * @returns Eligible paste is prevented and its plain text is inserted.
 * @throws Propagates Root text insertion failures.
 */
function pasteLabelText(
  options: EditableLabelInputOptions,
  event: ClipboardEvent<HTMLDivElement>,
): void {
  if (event.defaultPrevented || !options.editing) {
    return;
  }
  // Structured clipboard must not steal this paste; insert visible text.
  event.preventDefault();
  insertLabelText(
    options,
    getBrowserElementIdentity(event.currentTarget),
    event.clipboardData?.getData("text/plain") ?? "",
  );
}

/**
 * Keeps label pointer input away from canvas gestures when requested.
 *
 * @param options - Editing state and pointer propagation preference.
 * @param event - React pointer delivery at the mounted label.
 * @returns Propagation stops while editing when the host opted in.
 */
function stopLabelPointer(
  options: EditableLabelInputOptions,
  event: PointerEvent<HTMLDivElement>,
): void {
  if (options.editing && options.stopPointerWhileEditing) {
    event.stopPropagation();
  }
}

/**
 * Inserts plain text and retains the latest owned draft for a later blur.
 *
 * @param options - Borrowed Root access and draft state.
 * @param identity - Opaque label identity captured from React input delivery.
 * @param value - Plain text to insert at the current selection.
 * @returns The owned draft is updated when insertion remains current.
 * @throws Propagates Root text and browser selection failures.
 */
function insertLabelText(
  options: EditableLabelInputOptions,
  identity: RegionIdentity,
  value: string,
): void {
  const target = captureLabelText(options.panel, identity);
  if (target?.insertText(value)) {
    options.draft.current = target.readRenderedText() ?? options.draft.current;
  }
}

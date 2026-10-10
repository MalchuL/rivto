import type { ClipboardBundle, ClipboardPasteInput, EditorPosition, Selection } from "@chulane/rivto";

/** Clipboard operations bound to one rendered editor view. */
export interface ViewClipboardApi {
  /**
   * Copies the supplied selection, or this view's current selection, as structured data.
   * @param selection - Optional override read against this document; never changes selection.
   * @returns A detached clipboard bundle, or undefined when nothing can be copied.
   */
  copy(selection?: Selection): ClipboardBundle | undefined;
  /**
   * Copies an explicit text selection using current document content and offsets.
   * @param selection - Text range to serialize; a collapsed caret copies no content.
   * @returns A detached clipboard bundle, or undefined when the selection is empty.
   */
  copyText(selection: Selection): ClipboardBundle | undefined;
  /**
   * Copies this view's selection, then deletes it through the selection manager.
   * @returns The copied bundle, or undefined when no copyable selection exists; nothing is deleted in that case.
   */
  cut(): ClipboardBundle | undefined;
  /**
   * Pastes through the shared strategies with this view as the receiving surface.
   *
   * An explicit textTarget takes precedence over the view's current selection.
   * Without either, an empty structural selection prevents borrowing another view's
   * caret. View-aware strategies receive this view even if a nested paste changes focus.
   * @param input - Structured bundle, text, and placement options; defaults to an empty input.
   * @returns The resulting caret position, or undefined when no strategy returns one.
   */
  paste(input?: ClipboardPasteInput): EditorPosition | undefined;
}

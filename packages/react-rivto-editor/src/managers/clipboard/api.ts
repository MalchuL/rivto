import type { ClipboardBundle, ClipboardPasteInput, EditorPosition, Selection } from "@chulane/rivto";

/** Clipboard operations bound to one rendered editor panel. */
export interface PanelClipboardApi {
  /**
   * Copies the supplied selection, or this panel's current selection, as structured data.
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
   * Copies this panel's selection, then deletes it through the selection manager.
   * @returns The copied bundle, or undefined when no copyable selection exists; nothing is deleted in that case.
   */
  cut(): ClipboardBundle | undefined;
  /**
   * Pastes through the shared strategies with this panel as the receiving surface.
   *
   * An explicit textTarget takes precedence over the panel's current selection.
   * Without either, an empty structural selection prevents borrowing another panel's
   * caret. Panel-aware strategies receive this panel even if a nested paste changes focus.
   * @param input - Structured bundle, text, and placement options; defaults to an empty input.
   * @returns The resulting caret position, or undefined when no strategy returns one.
   */
  paste(input?: ClipboardPasteInput): EditorPosition | undefined;
}

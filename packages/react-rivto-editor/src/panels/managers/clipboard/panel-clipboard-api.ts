import type { ClipboardApi } from "../../../managers/clipboard/api";

/** Clipboard operations bound to one rendered editor panel. */
export interface PanelClipboardApi extends ClipboardApi {
  /**
   * Copies the supplied selection, or this panel's current selection, as structured data.
   * @param selection - Optional override read against this document; never changes selection.
   * @param reactPanel - Compatibility argument; this manager always uses its own panel.
   * @param operation - Copy, cut, or duplicate intent; defaults to copy.
   * @returns A detached clipboard bundle, or undefined when nothing can be copied.
   * @throws If the selection is outside the panel or a converter fails.
   */
  readonly copy: ClipboardApi["copy"];
  /**
   * Copies an explicit text selection using current document content and offsets.
   * @param selection - Text range to serialize; a collapsed caret copies no content.
   * @param reactPanel - Compatibility argument; this manager always uses its own panel.
   * @returns A detached clipboard bundle, or undefined when the selection is empty.
   * @throws If the selection is outside the panel or a converter fails.
   */
  readonly copyText: ClipboardApi["copyText"];
  /**
   * Copies this panel's selection, then deletes it through the selection manager.
   * @returns The copied bundle, or undefined when no copyable selection exists; nothing is deleted in that case.
   */
  readonly cut: ClipboardApi["cut"];
  /**
   * Pastes through the shared strategies with this panel as the receiving surface.
   *
   * An explicit textTarget takes precedence over the panel's current selection.
   * Without either, an empty structural selection prevents borrowing another panel's
   * caret. Panel-aware strategies receive this panel even if a nested paste changes focus.
   * @param input - Structured bundle, text, and placement options; defaults to an empty input.
   * @param reactPanel - Compatibility argument; this manager always uses its own panel.
   * @param operation - Paste or duplicate intent; defaults to paste.
   * @returns The resulting caret position, or undefined when no strategy returns one.
   * @throws If the target is outside the panel or a strategy or converter fails.
   */
  readonly paste: ClipboardApi["paste"];
}

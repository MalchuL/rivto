import type { ReactPanelApi } from "../../panels/types";
import type { PanelClipboardApi } from "./api";
import type { ClipboardManager } from "./clipboard-manager";

/** Clipboard operations use this panel; parsers, formatters, and strategies stay document-owned. */
export class PanelClipboardManager implements PanelClipboardApi {
  /** @param clipboard - Shared structured clipboard operations. @param reactPanel - Receiving occurrence. */
  constructor(
    private readonly clipboard: ClipboardManager,
    private readonly reactPanel: ReactPanelApi,
  ) {}
  /**
   * Copies the supplied selection, defaulting to this panel's current selection.
   *
   * @param selection - Selection to inspect or copy; copy methods default to the panel's current selection when omitted.
   * @returns Clipboard bundle, or undefined when no selection can be copied.
   */
  copy: PanelClipboardApi["copy"] = (selection) => {
    const current = selection ?? this.reactPanel.selection.get();
    return current ? this.clipboard.copy(current, this.reactPanel) : undefined;
  };
  /**
   * Copies an explicit text selection through this panel's block converters, excluding unselected children.
   *
   * @param selection - Explicit block text ranges to copy; a collapsed caret copies no content.
   * @returns Detached partial-text clipboard bundle, or undefined when there is no text to copy.
   */
  copyText: PanelClipboardApi["copyText"] = (selection) =>
    this.clipboard.copyText(selection, this.reactPanel);
  /**
   * Formats a cut bundle before deleting the panel selection so formatting failures leave content intact.
   *
   * @returns Cut bundle, or undefined when no selection can be copied.
   * @throws If conversion or formatting fails before deletion.
   */
  cut: PanelClipboardApi["cut"] = () => {
    const selection = this.reactPanel.selection.get();
    if (!selection) {
      return;
    }
    const bundle = this.clipboard.copy(selection, this.reactPanel, "cut");
    if (!bundle) {
      return;
    }
    this.reactPanel.editor.clipboardFormats.formatBundle(bundle);
    this.reactPanel.selection.delete();
    return bundle;
  };
  /**
   * Pastes clipboard input through this panel's scoped operations.
   *
   * @param input - Structured bundle, text, and placement options; defaults to an empty input.
   * @returns Resulting caret position, or undefined when no paste strategy returns one.
   */
  paste: PanelClipboardApi["paste"] = (input) => this.clipboard.paste(input, this.reactPanel);
}

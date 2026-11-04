import type { ReactPanelApi } from "../../panels/types";
import type { PanelClipboardApi } from "./api";
import type { ClipboardApi } from "../../editor/types";

/** Document clipboard operations borrowed by one panel. */
interface PanelClipboardSource {
  /**
   * Copies a structural or text selection in the supplied panel.
   *
   * @param selection - Selection to serialize, or omitted to read the panel or runtime selection.
   * @param reactPanel - Source panel, or omitted for a document-only copy.
   * @param operation - Copy, cut, or duplicate intent; defaults to copy.
   * @returns A detached clipboard bundle, or undefined when nothing can be copied.
   * @throws If a converter rejects the copied data.
   */
  readonly copy: ClipboardApi["copy"];

  /**
   * Copies an explicit text selection using the supplied panel's converters.
   *
   * @param selection - Text selection to serialize.
   * @param reactPanel - Optional source panel supplied to converters.
   * @returns A detached clipboard bundle, or undefined when there is no text to copy.
   * @throws If a converter rejects the copied data.
   */
  readonly copyText: ClipboardApi["copyText"];

  /**
   * Pastes clipboard input through the supplied panel's operations.
   *
   * @param input - Clipboard payload and insertion options; defaults to an empty input.
   * @param reactPanel - Receiving panel or document runtime; defaults to the editor.
   * @param operation - Paste or duplicate intent; defaults to paste.
   * @returns The resulting caret position, or undefined when no strategy produces one.
   * @throws If a converter, creation processor, validator, or panel scope check fails.
   */
  readonly paste: ClipboardApi["paste"];
}

/** Clipboard operations use this panel; parsers, formatters, and strategies stay document-owned. */
export class PanelClipboardManager implements PanelClipboardApi {
  /**
   * Binds shared structured clipboard operations to one panel occurrence.
   *
   * The panel owns its selection and scope; this manager borrows the shared
   * clipboard and does not own its registrations or lifetime.
   *
   * @param clipboard - Shared structured clipboard operations.
   * @param reactPanel - Receiving panel occurrence.
   */
  constructor(
    /** Shared clipboard operations borrowed from the document runtime. */
    private readonly clipboard: PanelClipboardSource,
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

import type { ReactPanelApi } from "../../panels/types";
import type { PanelClipboardApi } from "./api";
import type { ClipboardManager } from "./clipboard-manager";

/** Clipboard operations use this panel; parsers, formatters, and strategies stay document-owned. */
export class PanelClipboardManager implements PanelClipboardApi {
  /** @param clipboard - Shared structured clipboard operations. @param reactPanel - Receiving occurrence. */
  constructor(private readonly clipboard: ClipboardManager, private readonly reactPanel: ReactPanelApi) {}
  copy: PanelClipboardApi["copy"] = (selection) => {
    const current = selection ?? this.reactPanel.selection.get();
    return current ? this.clipboard.copy(current, this.reactPanel) : undefined;
  };
  copyText: PanelClipboardApi["copyText"] = (selection) => this.clipboard.copyText(selection, this.reactPanel);
  cut: PanelClipboardApi["cut"] = () => {
    const selection = this.reactPanel.selection.get();
    if (!selection) return;
    const bundle = this.clipboard.copy(selection, this.reactPanel, "cut");
    if (!bundle) return;
    this.reactPanel.editor.clipboardFormats.formatBundle(bundle);
    this.reactPanel.selection.delete();
    return bundle;
  };
  paste: PanelClipboardApi["paste"] = (input) => this.clipboard.paste(input, this.reactPanel);
}

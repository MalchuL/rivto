import type { PanelAPI } from "../../panels/types";
import type { ViewClipboardApi } from "./api";
import type { ClipboardManager } from "./clipboard-manager";

/** Clipboard operations use this view; parsers, formatters, and strategies stay document-owned. */
export class ViewClipboardManager implements ViewClipboardApi {
  /** @param clipboard - Shared structured clipboard operations. @param panel - Receiving occurrence. */
  constructor(private readonly clipboard: ClipboardManager, private readonly panel: PanelAPI) {}
  copy: ViewClipboardApi["copy"] = (selection) => {
    const current = selection ?? this.panel.selection.get();
    return current ? this.clipboard.copy(current, this.panel) : undefined;
  };
  copyText: ViewClipboardApi["copyText"] = (selection) => this.clipboard.copyText(selection, this.panel);
  cut: ViewClipboardApi["cut"] = () => {
    const selection = this.panel.selection.get();
    if (!selection) return;
    const bundle = this.clipboard.copy(selection, this.panel, "cut");
    if (!bundle) return;
    this.panel.editor.clipboardFormats.formatBundle(bundle);
    this.panel.selection.delete();
    return bundle;
  };
  paste: ViewClipboardApi["paste"] = (input) => this.clipboard.paste(input, this.panel);
}

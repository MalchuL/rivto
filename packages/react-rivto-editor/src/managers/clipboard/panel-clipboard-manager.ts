import type { PanelAPI } from "../../panels/types";
import type { PanelClipboardApi } from "./api";
import type { ClipboardManager } from "./clipboard-manager";

/** Clipboard operations use this panel; parsers, formatters, and strategies stay document-owned. */
export class PanelClipboardManager implements PanelClipboardApi {
  /** @param clipboard - Shared structured clipboard operations. @param panel - Receiving occurrence. */
  constructor(private readonly clipboard: ClipboardManager, private readonly panel: PanelAPI) {}
  copy: PanelClipboardApi["copy"] = (selection) => {
    const current = selection ?? this.panel.selection.get();
    return current ? this.clipboard.copy(current, this.panel) : undefined;
  };
  copyText: PanelClipboardApi["copyText"] = (selection) => this.clipboard.copyText(selection, this.panel);
  cut: PanelClipboardApi["cut"] = () => {
    const selection = this.panel.selection.get();
    if (!selection) return;
    const bundle = this.clipboard.copy(selection, this.panel, "cut");
    if (!bundle) return;
    this.panel.editor.clipboardFormats.formatBundle(bundle);
    this.panel.selection.delete();
    return bundle;
  };
  paste: PanelClipboardApi["paste"] = (input) => this.clipboard.paste(input, this.panel);
}

import type { EditorViewApi } from "../../editor-view/types";
import type { ViewClipboardApi } from "./api";
import type { ClipboardManager } from "./clipboard-manager";

/** Clipboard operations use this view; parsers, formatters, and strategies stay document-owned. */
export class ViewClipboardManager implements ViewClipboardApi {
  /** @param clipboard - Shared structured clipboard operations. @param editorView - Receiving occurrence. */
  constructor(private readonly clipboard: ClipboardManager, private readonly editorView: EditorViewApi) {}
  copy: ViewClipboardApi["copy"] = (selection) => {
    const current = selection ?? this.editorView.selection.get();
    return current ? this.clipboard.copy(current, this.editorView) : undefined;
  };
  copyText: ViewClipboardApi["copyText"] = (selection) => this.clipboard.copyText(selection, this.editorView);
  cut: ViewClipboardApi["cut"] = () => {
    const selection = this.editorView.selection.get();
    if (!selection) return;
    const bundle = this.clipboard.copy(selection, this.editorView, "cut");
    if (!bundle) return;
    this.editorView.runtime.clipboardFormats.formatBundle(bundle);
    this.editorView.selection.delete();
    return bundle;
  };
  paste: ViewClipboardApi["paste"] = (input) => this.clipboard.paste(input, this.editorView);
}

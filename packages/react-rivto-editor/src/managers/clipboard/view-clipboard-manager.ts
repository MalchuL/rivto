import type { ClipboardCapability } from "../../capabilities";
import type { EditorViewApi } from "../../types";
import type { ClipboardManager } from "./clipboard-manager";

/** Clipboard operations use this view; parsers, formatters, and strategies stay document-owned. */
export class ViewClipboardManager implements ClipboardCapability {
  /** @param shared - Document registrations. @param editor - Receiving occurrence. */
  constructor(private readonly shared: ClipboardManager, private readonly editor: EditorViewApi) {}
  get pasteStrategies() { return this.shared.pasteStrategies; }
  copy: ClipboardCapability["copy"] = (selection) => {
    const current = selection ?? this.editor.selection.get();
    return current ? this.shared.copy(current) : undefined;
  };
  copyText: ClipboardCapability["copyText"] = (selection) => this.shared.copyText(selection);
  cut: ClipboardCapability["cut"] = () => {
    const selection = this.editor.selection.get();
    if (!selection) return;
    const bundle = this.shared.copy(selection);
    if (bundle) this.editor.selection.delete();
    return bundle;
  };
  paste: ClipboardCapability["paste"] = (input) => this.shared.paste(input, this.editor);
  registerFormatter: ClipboardCapability["registerFormatter"] = (formatter) => this.shared.registerFormatter(formatter);
  registerParser: ClipboardCapability["registerParser"] = (parser) => this.shared.registerParser(parser);
  format: ClipboardCapability["format"] = (blocks) => this.shared.format(blocks);
  parse: ClipboardCapability["parse"] = (data) => this.shared.parse(data);
}

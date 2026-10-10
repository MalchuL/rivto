import type { PasteStrategy, RivtoEditorApi } from "@chulane/rivto";
import { BLOCK_PASTE_STRATEGY_ID, ClipboardManager as CoreClipboardManager, PRESERVE_NEWLINES_PASTE_STRATEGY_ID, TEXT_PASTE_STRATEGY_ID } from "@chulane/rivto";
import type { EditorViewApi } from "../../editor-view/types";

/** Optional view binding for paste algorithms that depend on a rendered surface. */
export interface ViewPasteStrategy extends PasteStrategy {
  /** Returns an algorithm bound to the receiving occurrence, without changing registrations. */
  createViewStrategy(editorView: EditorViewApi): PasteStrategy;
}

/** Shared structured clipboard pipeline; paste requires an explicit receiving view. */
export class ClipboardManager {
  /**
   * Creates the structured clipboard operations shared by a document's views.
   * @param editor - Core runtime providing clipboard operations and paste transactions.
   */
  constructor(private readonly editor: RivtoEditorApi) {}

  /** Core paste strategies extended by React clipboard integrations. */
  get pasteStrategies(): CoreClipboardManager["pasteStrategies"] { return this.editor.clipboard.pasteStrategies; }

  /** Copies the current or supplied selection as structured data. */
  copy(...args: Parameters<CoreClipboardManager["copy"]>): ReturnType<CoreClipboardManager["copy"]> {
    return this.editor.clipboard.copy(...args);
  }

  /** Copies an explicit text selection. */
  copyText(...args: Parameters<CoreClipboardManager["copyText"]>): ReturnType<CoreClipboardManager["copyText"]> {
    return this.editor.clipboard.copyText(...args);
  }

  /** Copies and deletes the current selection. */
  cut(): ReturnType<CoreClipboardManager["cut"]> { return this.editor.clipboard.cut(); }

  /** Pastes structured or plain clipboard data. */
  paste(input: Parameters<CoreClipboardManager["paste"]>[0], editorView: EditorViewApi): ReturnType<CoreClipboardManager["paste"]> {
    input ??= {};
    // A local pipeline retains the destination even if a strategy invokes another paste.
    const clipboard = new CoreClipboardManager(this.editor);
    for (const id of [BLOCK_PASTE_STRATEGY_ID, TEXT_PASTE_STRATEGY_ID, PRESERVE_NEWLINES_PASTE_STRATEGY_ID]) {
      clipboard.pasteStrategies.unregister(id);
    }
    this.pasteStrategies.getPasteStrategies().forEach((strategy, index) => {
      const bind = (strategy as Partial<ViewPasteStrategy>).createViewStrategy;
      clipboard.pasteStrategies.register(String(index), bind ? bind.call(strategy, editorView) : strategy);
    });
    // An inactive view has no caret; undefined would make core borrow another view's selection.
    const selection = input.textTarget ?? editorView.selection.get() ?? { type: "selection" as const, blocks: [], elements: [] };
    return clipboard.paste({ ...input, textTarget: selection });
  }

}

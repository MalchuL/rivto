import type { DocumentModelImpl } from "../../store/document-model";
import { createClipboardPayload, getSelectedBlocks, getTextRange, remapClipboardBundle, type ClipboardBundle } from "./clipboard-bundle";
import type { SelectionManager } from "./selection-manager";

/** MIME type carrying Rivto's lossless structured clipboard bundle. */
export const RIVTO_CLIPBOARD_MIME = "application/x-rivto+json";

/** Coordinates system clipboard I/O with selection and document mutations. */
export class ClipboardManager {
  /**
   * Creates a clipboard coordinator for one document and local selection.
   *
   * @param document - Collaborative content source and mutation boundary.
   * @param selection - Local selection source updated after insertion.
   */
  constructor(
    private readonly document: DocumentModelImpl,
    private readonly selection: SelectionManager,
  ) {}

  /**
   * Writes structured JSON, HTML, and plain text when browser APIs permit it.
   *
   * @returns Plain-text representation, including in non-browser environments.
   */
  async copy(): Promise<string> {
    const payload = createClipboardPayload(this.document, this.selection.get());
    if (!payload) return "";
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      const ClipboardItemClass = globalThis.ClipboardItem;
      if (ClipboardItemClass && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItemClass({
          [RIVTO_CLIPBOARD_MIME]: new Blob([JSON.stringify(payload.bundle)], { type: RIVTO_CLIPBOARD_MIME }),
          "text/html": new Blob([payload.html], { type: "text/html" }),
          "text/plain": new Blob([payload.text], { type: "text/plain" }),
        })]);
      } else {
        await navigator.clipboard.writeText(payload.text);
      }
    }
    return payload.text;
  }

  /**
   * Copies and then removes the selected text or block subtrees.
   *
   * @returns Plain-text representation copied before deletion.
   */
  async cut(): Promise<string> {
    const text = await this.copy();
    const selected = getSelectedBlocks(this.document, this.selection.get());
    if (selected.length > 1) selected.forEach((block) => this.document.removeBlock(block.id));
    else if (selected.length === 1) {
      const range = getTextRange(selected[0], this.selection.get());
      if (range) this.document.setBlockText(selected[0].id, range.text.slice(0, range.from) + range.text.slice(range.to));
    }
    return text;
  }

  /**
   * Reads browser clipboard data or inserts caller-supplied plain text.
   *
   * @param defaultBlockType - Explicit type used when plain text needs a new block.
   * @param text - Optional plain text that bypasses browser clipboard access.
   */
  async paste(defaultBlockType: string, text?: string): Promise<void> {
    if (text !== undefined) return this.pastePlain(defaultBlockType, text);
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    if (navigator.clipboard.read) {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types.includes(RIVTO_CLIPBOARD_MIME)) {
          this.pasteBundle(JSON.parse(await (await item.getType(RIVTO_CLIPBOARD_MIME)).text()) as ClipboardBundle);
          return;
        }
        if (item.types.includes("text/html")) {
          const html = await (await item.getType("text/html")).text();
          this.pastePlain(defaultBlockType, this.htmlToText(html));
          return;
        }
      }
    }
    this.pastePlain(defaultBlockType, await navigator.clipboard.readText());
  }

  /**
   * Handles a native copy event synchronously so browsers retain custom MIME data.
   */
  handleCopyEvent(event: ClipboardEvent): void {
    const payload = createClipboardPayload(this.document, this.selection.get());
    if (!payload || !event.clipboardData) return;
    event.preventDefault();
    event.clipboardData.setData(RIVTO_CLIPBOARD_MIME, JSON.stringify(payload.bundle));
    event.clipboardData.setData("text/html", payload.html);
    event.clipboardData.setData("text/plain", payload.text);
  }

  /**
   * Handles a native paste event using structured, HTML, then plain-text priority.
   */
  handlePasteEvent(event: ClipboardEvent, defaultBlockType: string): void {
    if (!event.clipboardData) return;
    event.preventDefault();
    const structured = event.clipboardData.getData(RIVTO_CLIPBOARD_MIME);
    if (structured) return this.pasteBundle(JSON.parse(structured) as ClipboardBundle);
    const html = event.clipboardData.getData("text/html");
    this.pastePlain(defaultBlockType, html ? this.htmlToText(html) : event.clipboardData.getData("text/plain"));
  }

  /**
   * Inserts a validated structured bundle with remapped block and link IDs.
   */
  pasteBundle(bundle: ClipboardBundle): void {
    const remapped = remapClipboardBundle(bundle);
    let previous = this.selection.get()?.head.blockId;
    this.document.transact(() => {
      remapped.blocks.forEach((block) => { previous = this.document.insertBlock(block, previous); });
      remapped.links.forEach((link) => this.document.createLink(link));
    });
  }

  /**
   * Inserts plain text into the selected range or creates an explicitly typed block.
   */
  private pastePlain(defaultBlockType: string, value: string): void {
    const selected = getSelectedBlocks(this.document, this.selection.get())[0];
    if (!selected) {
      this.document.insertBlock({ type: defaultBlockType, content: value });
      return;
    }
    const range = getTextRange(selected, this.selection.get());
    if (!range) return;
    this.document.setBlockText(selected.id, range.text.slice(0, range.from) + value + range.text.slice(range.to));
    const offset = range.from + value.length;
    this.selection.set({ anchor: { blockId: selected.id, offset }, head: { blockId: selected.id, offset } });
  }

  /** Converts interoperable HTML clipboard data to its visible plain text. */
  private htmlToText(html: string): string {
    return new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
  }
}

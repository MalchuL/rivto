import type { DocumentModelImpl } from "../../store/document-model";
import {
  createClipboardPayload,
  normalizeSelection,
  remapClipboardBundle,
  type ClipboardBundle,
  type NormalizedSelection,
} from "./clipboard-bundle";
import type { SelectionManager } from "./selection-manager";

/** MIME type carrying Rivto's lossless structured clipboard bundle. */
export const RIVTO_CLIPBOARD_MIME = "application/x-rivto+json";

/**
 * Coordinates system clipboard I/O with selection and document mutations.
 *
 * This manager owns clipboard semantics, but not browser rendering or CRDT
 * storage details. Pure helpers create/remap portable clipboard values;
 * DocumentModelImpl performs the atomic mutations; the React binding later
 * reconciles focused DOM and restores the native caret.
 */
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
   * Cut intentionally delegates deletion to the same range replacement used by
   * plain paste. Therefore a cross-block cut keeps the unselected prefix of the
   * first block, joins the unselected suffix of the last block, and removes only
   * the blocks between those boundaries.
   *
   * @returns Plain-text representation copied before deletion.
   */
  async cut(): Promise<string> {
    const selection = this.selection.get();
    const text = await this.copy();
    const range = normalizeSelection(this.document, selection);
    if (range && selection?.type !== "text") {
      // Whole-block selection is structurally different from a text range:
      // retaining an empty first block would turn Cut into partial text
      // replacement. Remove selected subtrees in visible order instead.
      this.document.transact(() => range.blocks.forEach((block) => this.document.removeBlock(block.id)));
      this.selection.clear();
      return text;
    }
    if (range && (range.start.blockId !== range.end.blockId || range.start.offset !== range.end.offset)) {
      this.replaceRange(range, "");
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
   * Inserts a structured block bundle at the current selection or caret.
   *
   * Desired cursor-paste behavior mirrors ordinary block editors. Given target
   * `Hello |world` and copied blocks `First`, `Second`, the result is:
   *
   * - current target: `Hello First`, retaining its existing type and metadata;
   * - next copied block: `Secondworld`, retaining the copied block's type/data;
   * - caret: after `Second` and before the preserved `world` suffix.
   *
   * The first copied block is therefore consumed as text rather than inserted
   * as a sibling. Its children attach beneath the target, and its source ID maps
   * to the target for link remapping. Remaining copied roots are ordinary new
   * siblings. If only one block was copied, prefix + copied content + suffix all
   * remain in the target.
   *
   * A non-collapsed selection follows the same rule after removing the selected
   * range. With no valid editor selection, all copied roots are inserted as new
   * blocks because there is no current block whose type should be preserved.
   * All document changes happen inside one transaction so collaborators never
   * observe the intermediate removal/insertion states.
   *
   * @param bundle - Structured block trees and internal links to paste.
   */
  pasteBundle(bundle: ClipboardBundle): void {
    if (!bundle.blocks.length) return;
    const range = normalizeSelection(this.document, this.selection.get());
    if (!range) {
      // There is no text destination. Preserve every copied root instead of
      // inventing a target block or consuming the first block's type/data.
      const remapped = remapClipboardBundle(bundle);
      let previous: string | undefined;
      let lastOffset = 0;
      this.document.transact(() => {
        remapped.blocks.forEach((block) => {
          previous = this.document.insertBlock(block, previous);
          lastOffset = block.content?.length ?? 0;
        });
        remapped.links.forEach((link) => this.document.createLink(link));
      });
      if (previous) this.collapse(previous, lastOffset);
      return;
    }
    const target = range.blocks[0];
    const first = bundle.blocks[0];
    // These are the only pieces of the old selection boundary that survive.
    // The prefix stays in the target; the suffix moves behind pasted content.
    const prefix = target.content.slice(0, range.start.offset);
    const suffix = range.blocks.at(-1)?.content.slice(range.end.offset) ?? "";
    // Mapping the copied root to target.id preserves links without replacing
    // target.type, target.props, target.pluginData, or target.layout.
    const remapped = remapClipboardBundle(bundle, target.id);
    let previous = target.id;
    let caretOffset = prefix.length + first.content.length;
    this.document.transact(() => {
      // Remove selected continuation blocks before inserting replacements so
      // their links are cleaned up by the normal DocumentModel rules.
      this.removeRangeTail(range);
      // A single copied block also receives the old suffix here. With multiple
      // blocks, the suffix belongs to the final inserted block below.
      this.document.setBlockText(target.id, prefix + first.content + (remapped.blocks.length ? "" : suffix));
      remapped.firstChildren.forEach((child) => {
        // insertBlock creates a sibling; indentBlock immediately moves it under
        // the retained target. Both calls remain inside the outer transaction.
        const childId = this.document.insertBlock(child, target.id);
        this.document.indentBlock(childId);
      });
      remapped.blocks.forEach((block, index) => {
        const isLast = index === remapped.blocks.length - 1;
        const pastedLength = block.content?.length ?? 0;
        // Append the old suffix only to the last pasted block. caretOffset uses
        // the pre-suffix length so typing resumes before that preserved text.
        previous = this.document.insertBlock({ ...block, content: `${block.content ?? ""}${isLast ? suffix : ""}` }, previous);
        if (isLast) caretOffset = pastedLength;
      });
      remapped.links.forEach((link) => this.document.createLink(link));
    });
    this.collapse(previous, caretOffset);
  }

  /**
   * Inserts plain text into the selected range or creates an explicitly typed block.
   *
   * Newlines are content, not implicit block delimiters. When a target exists,
   * this method keeps its native type and inserts the complete string into that
   * block. `defaultBlockType` is used only when there is no valid destination.
   *
   * @param defaultBlockType - Type for a newly created destination block only.
   * @param value - Exact plain text, including any newline characters.
   */
  private pastePlain(defaultBlockType: string, value: string): void {
    const range = normalizeSelection(this.document, this.selection.get());
    if (!range) {
      const id = this.document.insertBlock({ type: defaultBlockType, content: value });
      this.collapse(id, value.length);
      return;
    }
    this.replaceRange(range, value);
  }

  /**
   * Replaces a normalized selection with text while retaining its first block.
   *
   * For a same-block selection this is normal text replacement. Across blocks,
   * the first block becomes `prefix + value + final suffix`; every later block
   * touched by the range is removed. The retained block's type and metadata are
   * never patched, which is the central invariant shared by paste and cut.
   *
   * @param range - Ordered selection whose first block remains the target.
   * @param value - Exact text, including newlines, inserted at the start offset.
   */
  private replaceRange(range: NormalizedSelection, value: string): void {
    const target = range.blocks[0];
    const end = range.blocks.at(-1) ?? target;
    const prefix = target.content.slice(0, range.start.offset);
    const suffix = end.content.slice(range.end.offset);
    this.document.transact(() => {
      this.removeRangeTail(range);
      this.document.setBlockText(target.id, prefix + value + suffix);
    });
    this.collapse(target.id, prefix.length + value.length);
  }

  /**
   * Removes every selected block after the retained range start.
   *
   * DocumentModelImpl owns subtree and touching-link cleanup. Calling it in
   * visible order means removing an ancestor makes later descendant removals
   * harmless no-ops, avoiding clipboard-specific storage traversal logic.
   *
   * @param range - Ordered selection whose first block must survive.
   */
  private removeRangeTail(range: NormalizedSelection): void {
    range.blocks.slice(1).forEach((block) => this.document.removeBlock(block.id));
  }

  /**
   * Stores a collapsed local selection after a completed clipboard mutation.
   *
   * @param blockId - Surviving or inserted block containing the caret.
   * @param offset - UTF-16 position immediately after pasted content.
   */
  private collapse(blockId: string, offset: number): void {
    this.selection.set({ type: "text", anchor: { blockId, offset }, head: { blockId, offset } });
  }

  /** Converts interoperable HTML clipboard data to its visible plain text. */
  private htmlToText(html: string): string {
    return new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
  }
}

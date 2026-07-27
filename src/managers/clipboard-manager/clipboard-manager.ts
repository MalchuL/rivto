import { DEFAULT_BLOCK_TYPE } from "../../blocks";
import type { EditorRuntime } from "../../editor/rivto-editor";
import { isBlockCollapsed } from "../../utils";
import type { NormalizedSelection } from "../selection-manager";
import type { ClipboardBundle, ClipboardPasteInput, ClipboardPayload } from "./types";
import {
  escapeHtml,
  findBlock,
  flattenBlocks,
  remapClipboardBundle,
  selectedTopLevelSubtrees,
} from "./utils";

/**
 * Structural destination for a non-merging structured paste.
 *
 * `afterId` covers ordinary sibling insertion. `beforeChildId` additionally
 * moves inserted roots before an expanded target's existing first child.
 */
interface BlockPastePlacement {
  /** Initial sibling after which roots are inserted; null starts at root zero. */
  afterId?: string | null;
  /** Existing first child before which every inserted root is finally moved. */
  beforeChildId?: string;
}

/**
 * Owns framework-neutral copy, cut, and paste behavior for one editor.
 *
 * Browser integrations remain responsible for native clipboard events. The
 * manager defines the public API and history boundary, while stateless
 * clipboard transformations live in its `utils` folder. One manager belongs
 * to exactly one EditorRuntime and must not be shared between editor instances.
 */
export class ClipboardManager {
  /**
   * Creates the clipboard manager owned by one editor runtime.
   *
   * @param editor - Runtime whose document, selection, and history are used.
   */
  constructor(private readonly editor: EditorRuntime) {}

  /**
   * Serializes the current selection without changing document or selection.
   *
   * The payload contains lossless Rivto structure plus interoperable HTML and
   * plain-text flavors for the host to write into a native clipboard event.
   *
   * @returns Structured, HTML, and plain-text flavors, or undefined when there
   * is no copyable selection.
   */
  copy(): ClipboardPayload | undefined {
    return this.createClipboardPayload();
  }

  /**
   * Serializes and removes the current selection as one undoable action.
   *
   * Copy happens first so the returned payload exactly describes the content
   * that deletion removes. `SelectionManager.delete()` owns structural and text
   * deletion semantics, including the final-empty-paragraph invariant.
   *
   * @returns The copied flavors, or undefined when there is no selection.
   */
  cut(): ClipboardPayload | undefined {
    const payload = this.copy();
    if (!payload) return;
    this.editor.selection.delete();
    return payload;
  }

  /**
   * Pastes the best available portable clipboard flavor at current selection.
   *
   * Parsed structured data takes precedence over serialized structured data,
   * which takes precedence over plain text. The manager separates this paste
   * from adjacent typing history; utility functions provide the inner atomic
   * document transaction and resulting portable selection.
   *
   * @param input - Clipboard flavors and paste policy supplied by a host.
   */
  paste(input: ClipboardPasteInput = {}): void {
    this.documentAction(() => {
      const bundle = input.bundle
        ?? (input.structured ? JSON.parse(input.structured) as ClipboardBundle : undefined);
      if (bundle) {
        this.pasteClipboardBundle(bundle, input.mergeText !== false);
        return;
      }
      this.pastePlainText(
        input.defaultBlockType ?? DEFAULT_BLOCK_TYPE,
        input.text ?? "",
      );
    });
  }

  /**
   * Creates clipboard flavors from the current normalized selection.
   *
   * Boundary text is trimmed only on detached clones, never in the document.
   * Links are included only when both endpoints are carried by the copied
   * forest. This method performs no document or selection write.
   *
   * @returns Portable clipboard flavors, or undefined for an empty selection.
   */
  private createClipboardPayload(): ClipboardPayload | undefined {
    const current = this.editor.selection.get();
    const range = this.editor.selection.normalize(current);
    if (!range?.blocks.length) return undefined;
    const blocks = selectedTopLevelSubtrees(
      this.editor.document.document,
      range,
      !current.some((item) => item.type === "text"),
    );
    const start = findBlock(blocks, range.start.blockId);
    const end = findBlock(blocks, range.end.blockId);
    if (!start || !end) return undefined;
    if (start === end) start.content = start.content.slice(range.start.offset, range.end.offset);
    else {
      start.content = start.content.slice(range.start.offset);
      end.content = end.content.slice(0, range.end.offset);
    }

    const visible = flattenBlocks(blocks);
    const ids = new Set(visible.map((block) => block.id));
    const links = this.editor.document.links.filter(
      (link) => ids.has(link.from.blockId) && ids.has(link.to.blockId),
    );
    return {
      bundle: { version: 1, startsWithText: current[0]?.type === "text", blocks, links },
      html: visible.map((block) => `<p>${escapeHtml(block.content)}</p>`).join(""),
      text: visible.map((block) => block.content).join("\n"),
    };
  }

  /**
   * Pastes a structured Rivto bundle at the current selection.
   *
   * Whole-block bundles are inserted structurally. A bundle beginning with
   * partial text can instead replace the active text range, reuse that block's
   * ID, insert remaining roots as siblings, and move the old suffix to the
   * final inserted block. Every document mutation runs in one CRDT transaction.
   *
   * @param bundle - Portable block hierarchy and links to validate and insert.
   * @param mergeText - Whether a partial first block may merge into a text target.
   */
  private pasteClipboardBundle(bundle: ClipboardBundle, mergeText: boolean): void {
    if (!bundle.blocks.length) return;
    const current = this.editor.selection.get();
    const hasTextTarget = current.some((item) => item.type === "text");
    if (!mergeText || bundle.startsWithText !== true || !hasTextTarget) {
      const active = current.at(-1);
      const range = this.editor.selection.normalize(current);
      const afterId = active?.type === "block"
        ? active.focusBlockId
        : active?.type === "edgeless"
          ? active.blockIds.at(-1)
          : active?.type === "text"
            ? active.head.blockId
            : range?.blocks.at(-1)?.id;
      const caretBlock = active?.type === "text"
        ? findBlock(this.editor.document.document, active.head.blockId)
        : undefined;

      // Expanded parents receive pasted roots before their current first child.
      // Collapsed parents behave as visible leaves, so paste remains after them.
      const beforeChildId = !caretBlock || isBlockCollapsed(caretBlock)
        ? undefined
        : caretBlock.children[0]?.id;
      this.insertBundleAsBlocks(bundle, { afterId, beforeChildId });
      return;
    }

    const range = this.editor.selection.normalize(current);
    if (!range) {
      this.insertBundleAsBlocks(bundle);
      return;
    }
    const target = range.blocks[0]!;
    const first = bundle.blocks[0]!;
    const prefix = target.content.slice(0, range.start.offset);
    const suffix = range.blocks.at(-1)?.content.slice(range.end.offset) ?? "";
    const remapped = remapClipboardBundle(bundle, target.id);
    let previous = target.id;
    let caretOffset = prefix.length + first.content.length;

    // Replacement, root insertion, child restoration, and link restoration are
    // observed as one atomic document change and one manager history action.
    this.editor.document.transact(() => {
      this.removeRangeTail(range);
      this.editor.document.setBlockText(
        target.id,
        prefix + first.content + (remapped.blocks.length ? "" : suffix),
      );
      remapped.firstChildren.forEach((child) => {
        const childId = this.editor.document.insertBlock(child, target.id);
        this.editor.document.indentBlock(childId);
      });
      remapped.blocks.forEach((block, index) => {
        const pastedLength = block.content?.length ?? 0;
        const isLast = index === remapped.blocks.length - 1;
        previous = this.editor.document.insertBlock(
          { ...block, content: `${block.content ?? ""}${isLast ? suffix : ""}` },
          previous,
        );
        if (isLast) caretOffset = pastedLength;
      });
      remapped.links.forEach((link) => this.editor.document.createLink(link));
    });
    this.collapse(previous, caretOffset);
  }

  /**
   * Pastes plain text at the current range.
   *
   * A single line replaces selected text or inserts at the caret. Multiple
   * lines keep the first line in the target, create subsequent sibling blocks,
   * and append the replaced target suffix to the last new block. With no
   * selection, every line becomes a new root.
   *
   * @param defaultBlockType - Registered block type used for newly created lines.
   * @param value - Plain clipboard text, including possible newline delimiters.
   */
  private pastePlainText(defaultBlockType: string, value: string): void {
    const range = this.editor.selection.normalize();
    const lines = value.split(/\r\n?|\n/);
    if (!range) {
      let lastId: string | undefined;
      this.editor.document.transact(() => {
        lines.forEach((line) => {
          lastId = this.editor.document.insertBlock(
            { type: defaultBlockType, content: line },
            lastId,
          );
        });
      });
      if (lastId) this.collapse(lastId, lines.at(-1)?.length ?? 0);
      return;
    }

    const target = range.blocks[0]!;
    const end = range.blocks.at(-1) ?? target;
    const prefix = target.content.slice(0, range.start.offset);
    const suffix = end.content.slice(range.end.offset);
    if (lines.length === 1) {
      this.editor.document.transact(() => {
        this.removeRangeTail(range);
        this.editor.document.setBlockText(target.id, prefix + value + suffix);
      });
      this.collapse(target.id, prefix.length + value.length);
      return;
    }

    let previous = target.id;
    let lastId = target.id;
    this.editor.document.transact(() => {
      this.removeRangeTail(range);
      this.editor.document.setBlockText(target.id, prefix + lines[0]!);
      lines.slice(1).forEach((line, index, rest) => {
        const isLast = index === rest.length - 1;
        lastId = this.editor.document.insertBlock(
          { type: defaultBlockType, content: `${line}${isLast ? suffix : ""}` },
          previous,
        );
        previous = lastId;
      });
    });
    this.collapse(lastId, lines.at(-1)?.length ?? 0);
  }

  /**
   * Inserts a complete structured bundle without merging its first root.
   *
   * The resulting selection contains the final pasted root; each root already
   * carries its complete nested subtree.
   *
   * @param bundle - Portable structured data to remap and insert.
   * @param placement - Optional sibling or first-child structural destination.
   */
  private insertBundleAsBlocks(
    bundle: ClipboardBundle,
    placement: BlockPastePlacement = {},
  ): void {
    const remapped = remapClipboardBundle(bundle);
    let lastId: string | undefined;
    this.editor.document.transact(() => {
      const insertedIds: string[] = [];
      let previous = placement.afterId;
      remapped.blocks.forEach((block) => {
        previous = this.editor.document.insertBlock(block, previous ?? undefined);
        insertedIds.push(previous);
      });
      if (placement.beforeChildId && insertedIds.length) {
        this.editor.document.moveBlocks(insertedIds, placement.beforeChildId, "before");
      }
      lastId = insertedIds.at(-1);
      remapped.links.forEach((link) => this.editor.document.createLink(link));
    });
    if (lastId) {
      this.editor.selection.set([{
        type: "block",
        blockIds: [lastId],
        anchorBlockId: lastId,
        focusBlockId: lastId,
      }]);
    }
  }

  /**
   * Removes every block after the first boundary block in a text replacement.
   *
   * The first block survives because its prefix receives inserted content.
   * Callers must invoke this helper inside their document transaction.
   *
   * @param range - Ordered range whose trailing blocks should be removed.
   */
  private removeRangeTail(range: NormalizedSelection): void {
    range.blocks.slice(1).forEach((block) => this.editor.document.removeBlock(block.id));
  }

  /**
   * Publishes a collapsed text selection after a completed paste.
   *
   * @param blockId - Existing block that owns the resulting caret.
   * @param offset - UTF-16 content offset at which the caret collapses.
   */
  private collapse(blockId: string, offset: number): void {
    this.editor.selection.set([{
      type: "text",
      anchor: { blockId, offset },
      head: { blockId, offset },
    }]);
  }

  /**
   * Prevents one clipboard mutation from merging with adjacent undo captures.
   *
   * Both boundaries run through `finally`, so invalid external clipboard data
   * cannot leave later editor commands grouped with a failed paste.
   *
   * @param action - Synchronous clipboard mutation to isolate.
   * @returns The action result.
   */
  private documentAction<T>(action: () => T): T {
    this.editor.history.stopCapturing();
    try {
      return action();
    } finally {
      this.editor.history.stopCapturing();
    }
  }
}

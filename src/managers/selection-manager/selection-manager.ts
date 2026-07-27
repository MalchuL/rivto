import { DEFAULT_BLOCK_TYPE } from "../../blocks";
import type { EditorPosition, EditorSelection, EditorSelectionItem } from "../../editor/types";
import type { EditorRuntime } from "../../editor/rivto-editor";
import type { Block } from "../../store/document-model";
import type { NormalizedSelection } from "./types";

/** Returns detached blocks in depth-first document order. */
function flattenBlocks(blocks: Block[]): Block[] {
  return blocks.flatMap((block) => [block, ...flattenBlocks(block.children)]);
}

/** Creates a detached copy of one selection item. */
function cloneSelection(selection: EditorSelectionItem): EditorSelectionItem {
  return selection.type === "text"
    ? { type: "text", anchor: { ...selection.anchor }, head: { ...selection.head } }
    : { ...selection, blockIds: [...selection.blockIds] };
}

/**
 * Owns an ordered list of detached local selection items.
 *
 * Selection is local editor-session state. It is intentionally not stored in
 * the collaborative document, because each user/view can have different active
 * text ranges, block selections, or canvas selections over the same document.
 *
 * The manager belongs to one EditorRuntime, so `set()` can validate block IDs,
 * text offsets, endpoint membership, document order, and mode compatibility
 * before publishing state.
 */
export class SelectionManager {
  private value: EditorSelection = [];
  private readonly listeners = new Set<() => void>();

  /**
   * Creates the selection manager owned by one editor runtime.
   *
   * @param editor - Runtime providing the current document and editor mode.
   */
  constructor(private readonly editor: EditorRuntime) {}

  /**
   * Returns the current detached selection list.
   *
   * Nested text positions and selected block arrays are copied so callers cannot
   * mutate manager state without going through `set` and notifying subscribers.
   */
  get(): EditorSelection {
    return this.value.map(cloneSelection);
  }

  /**
   * Converts a heterogeneous selection list into one document-ordered range.
   *
   * Text selections retain their partial UTF-16 boundary offsets. Block and
   * edgeless selections contribute complete blocks. When the list contains
   * both kinds, the result spans from the earliest boundary to the latest one,
   * allowing structural commands and clipboard operations to share exactly
   * the same interpretation of the current selection.
   *
   * @param selection - Selection to normalize; defaults to the current value.
   * @returns Ordered boundaries and blocks, or undefined for an empty selection.
   */
  normalize(selection: EditorSelection = this.get()): NormalizedSelection | undefined {
    if (!selection.length) return undefined;
    const all = flattenBlocks(this.editor.document.document);
    const indices = new Map(all.map((block, index) => [block.id, index]));

    const normalizeItem = (item: EditorSelectionItem): NormalizedSelection | undefined => {
      if (item.type !== "text") {
        const selected = new Set(item.blockIds);
        const blocks = all.filter((block) => selected.has(block.id));
        const first = blocks[0];
        const last = blocks.at(-1);
        return first && last ? {
          start: { blockId: first.id, offset: 0 },
          end: { blockId: last.id, offset: last.content.length },
          blocks,
        } : undefined;
      }

      const anchorIndex = indices.get(item.anchor.blockId);
      const headIndex = indices.get(item.head.blockId);
      if (anchorIndex === undefined || headIndex === undefined) return undefined;
      const forward = anchorIndex < headIndex
        || (anchorIndex === headIndex && item.anchor.offset <= item.head.offset);
      const start = forward ? item.anchor : item.head;
      const end = forward ? item.head : item.anchor;
      return {
        start: { ...start },
        end: { ...end },
        blocks: all.slice(Math.min(anchorIndex, headIndex), Math.max(anchorIndex, headIndex) + 1),
      };
    };

    const ranges = selection.flatMap((item) => {
      const range = normalizeItem(item);
      return range ? [range] : [];
    });
    if (!ranges.length) return undefined;

    if (!selection.some((item) => item.type === "text")) {
      const selected = new Set(ranges.flatMap((range) => range.blocks.map((block) => block.id)));
      const blocks = all.filter((block) => selected.has(block.id));
      const first = blocks[0];
      const last = blocks.at(-1);
      return first && last ? {
        start: { blockId: first.id, offset: 0 },
        end: { blockId: last.id, offset: last.content.length },
        blocks,
      } : undefined;
    }

    const compare = (left: EditorPosition, right: EditorPosition): number => {
      const blockDifference = (indices.get(left.blockId) ?? -1) - (indices.get(right.blockId) ?? -1);
      return blockDifference || left.offset - right.offset;
    };
    const start = ranges
      .map((range) => range.start)
      .reduce((earliest, position) => compare(position, earliest) < 0 ? position : earliest);
    const end = ranges
      .map((range) => range.end)
      .reduce((latest, position) => compare(position, latest) > 0 ? position : latest);
    const startIndex = indices.get(start.blockId);
    const endIndex = indices.get(end.blockId);
    if (startIndex === undefined || endIndex === undefined) return undefined;
    return {
      start: { ...start },
      end: { ...end },
      blocks: all.slice(startIndex, endIndex + 1),
    };
  }

  /**
   * Replaces every selection item with detached copies and notifies subscribers.
   *
   * Text selection direction is preserved. Operations that need document-order
   * ranges can normalize later, while UI can still know whether the user dragged
   * top-to-bottom or bottom-to-top.
   *
   * @param selection - Local selection list to validate and publish.
   */
  set(selection: EditorSelection): void {
    if (!Array.isArray(selection)) throw new Error("Selection must be a list");
    const normalized = selection.map((item): EditorSelectionItem => {
      if (!item || !["text", "block", "edgeless"].includes(item.type)) throw new Error("Invalid selection");
      if (item.type === "text") {
        this.validatePosition(item.anchor.blockId, item.anchor.offset);
        this.validatePosition(item.head.blockId, item.head.offset);
        return item;
      }

      if (!item.blockIds.length) throw new Error("Selection requires at least one block");
      item.blockIds.forEach((id) => {
        if (!this.editor.getBlock(id)) throw new Error(`Selection block ${id} not found`);
      });
      if (item.type === "edgeless") {
        if (this.editor.mode.get() !== "edgeless") throw new Error("Edgeless selection requires edgeless mode");
        return item;
      }
      if (!item.blockIds.includes(item.anchorBlockId) || !item.blockIds.includes(item.focusBlockId)) {
        throw new Error("Block selection endpoints must be selected");
      }

      const selected = new Set(item.blockIds);
      const ordered: string[] = [];
      const visit = (blocks: ReturnType<EditorRuntime["getBlocks"]>): void => blocks.forEach((block) => {
        if (selected.has(block.id)) ordered.push(block.id);
        visit(block.children);
      });
      visit(this.editor.getBlocks());
      return { ...item, blockIds: ordered };
    });
    this.value = normalized.map(cloneSelection);
    this.notify();
  }

  /**
   * Deletes the current text or structural selection as one undoable action.
   *
   * Text ranges collapse at their surviving start boundary. Whole-block
   * selections remove complete subtrees and focus the nearest surviving block.
   * Removing every root creates one empty default block so the editor always
   * retains a valid keyboard target.
   *
   * @param defaultBlockType - Type used for the final empty fallback block.
   */
  delete(defaultBlockType = DEFAULT_BLOCK_TYPE): void {
    const current = this.get();
    const range = this.normalize(current);
    if (!range) return;

    this.editor.history.stopCapturing();
    try {
      if (!current.some((item) => item.type === "text")) {
        const visibleBefore = flattenBlocks(this.editor.document.document);
        const firstRemovedIndex = Math.max(
          0,
          visibleBefore.findIndex((block) => block.id === range.blocks[0]?.id),
        );
        let caretBlockId: string | undefined;
        this.editor.document.transact(() => {
          range.blocks.forEach((block) => this.editor.document.removeBlock(block.id));
          if (!this.editor.document.document.length) {
            caretBlockId = this.editor.document.insertBlock({ type: defaultBlockType, content: "" });
            return;
          }

          const remaining = flattenBlocks(this.editor.document.document);
          caretBlockId = remaining[Math.min(firstRemovedIndex, remaining.length - 1)]?.id;
        });
        if (caretBlockId) this.collapse(caretBlockId, 0);
        else this.clear();
        return;
      }

      const target = range.blocks[0]!;
      const end = range.blocks.at(-1) ?? target;
      const prefix = target.content.slice(0, range.start.offset);
      const suffix = end.content.slice(range.end.offset);
      this.editor.document.transact(() => {
        range.blocks.slice(1).forEach((block) => this.editor.document.removeBlock(block.id));
        this.editor.document.setBlockText(target.id, prefix + suffix);
      });
      this.collapse(target.id, prefix.length);
    } finally {
      this.editor.history.stopCapturing();
    }
  }

  /** Clears an active selection without notifying when selection is already empty. */
  clear(): void {
    if (!this.value.length) return;
    this.value = [];
    this.notify();
  }

  /**
   * Subscribes to selection changes.
   *
   * @param listener - Callback called after `set` or effective `clear`.
   * @returns Function that removes this listener.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Notifies a stable listener snapshot so callbacks can unsubscribe safely. */
  private notify(): void {
    [...this.listeners].forEach((listener) => listener());
  }

  /** Publishes a collapsed text caret without exposing mutable point objects. */
  private collapse(blockId: string, offset: number): void {
    this.set([{
      type: "text",
      anchor: { blockId, offset },
      head: { blockId, offset },
    }]);
  }

  /** Validates one UTF-16 position against current block content. */
  private validatePosition(blockId: string, offset: number): void {
    const block = this.editor.getBlock(blockId);
    if (!block) throw new Error(`Selection block ${blockId} not found`);
    if (!Number.isInteger(offset) || offset < 0 || offset > block.content.length) {
      throw new Error(`Selection offset ${offset} is outside block ${blockId}`);
    }
  }
}

import type { EditorPosition, EditorSelection, EditorSelectionItem } from "../../editor/types";
import type { EditorRuntime } from "../../editor/rivto-editor";
import type { Block } from "../../store/document-model";
import { Listeners } from "../../utils";
import type { NormalizedSelection } from "./types";
import { isStructuralSelection } from "./utils";

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
 * text ranges or whole-block selections over the same document.
 *
 * The manager belongs to one EditorRuntime, so `set()` can validate block IDs,
 * text offsets, endpoint membership, and document order before publishing state.
 */
export class SelectionManager {
  private value: EditorSelection = [];
  private readonly listeners = new Listeners<{ selectionChanged: void }>();

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
   * Converts a heterogeneous selection list into **one** document-ordered range
   * with blocks data.
   *
   * Text selections retain their partial UTF-16 boundary offsets. Block
   * selections contribute complete blocks. When the list contains both kinds,
   * the result spans from the earliest boundary to the latest one,
   * allowing structural commands and clipboard operations to share exactly
   * the same interpretation of the current selection.
   *
   * Important: if the list has several `text` items (or text mixed with
   * blocks), they are collapsed into a single range from the earliest
   * boundary to the latest. Gaps between those text items are filled — this
   * is not multi-cursor / disjoint text selection.
   *
   * Caret (collapsed text selection): when `anchor` and `head` are the same
   * `{ blockId, offset }`, normalization still succeeds. `start` and `end` are
   * that same position, and `blocks` contains only that one block. Callers that
   * need “is this a caret?” compare `start`/`end` for equality (or check that
   * the original list is one text item with equal endpoints); normalize itself
   * does not return a separate caret flag.
   *
   * @param selection - Selection to normalize; defaults to the current value.
   * Can be text or block selection. Blocks can be selected not consecutively.
   * Inside single selection item can be several blocks selected.
   * @returns Ordered boundaries and blocks, or undefined for an empty selection.
   * If selection is empty, return undefined.
   * If selection is a caret, return identical start/end and a one-block list.
   * If selection is text, return start and end and all blocks in between.
   * If selection is block-only, return start and end of the selected set, but
   * `blocks` is only the selected IDs (gaps stay, e.g. 1, 3, 10).
   * If selection is mixed (has text), return start and end and all blocks in between.
   */
  normalize(selection: EditorSelection = this.get()): NormalizedSelection | undefined {
    if (!selection.length) return undefined;
    // Get all blocks in document order
    const all = flattenBlocks(this.editor.blocks.getBlocks());
    const indices = new Map(all.map((block, index) => [block.id, index]));  // id to index

    // Editor selection to ordered range with blocks
    // Block item: start/end of the selected set; blocks = selected IDs only (gaps stay).
    // Text item: start/end in document order; blocks = every block between endpoints.
    const normalizeItem = (item: EditorSelectionItem): NormalizedSelection | undefined => {
      // Block-only selection (no text items): union selected ids, gaps stay
      if (item.type !== "text") {
        const selected = new Set(item.blockIds);
        // Keep only selected ids, in document order (do not fill gaps).
        // Example: [10, 1, 3] -> [1, 3, 10]
        const blocks = all.filter((block) => selected.has(block.id));
        const first = blocks[0];
        const last = blocks.at(-1);
        return first && last ? {
          start: { blockId: first.id, offset: 0 },
          end: { blockId: last.id, offset: last.content.length },
          blocks,
        } : undefined;
      }

      // Handle text selection which is TextSelection
      // This is a consecutive selection between two positions with blocks and offsets.
      // Example: from block 1, offset 10 to block 3, offset 5
      const anchorIndex = indices.get(item.anchor.blockId);
      const headIndex = indices.get(item.head.blockId);
      if (anchorIndex === undefined || headIndex === undefined) return undefined;
      // Determine the start and end of the selection. Selection can be forward or backward.
      // Forward means the selection is from first to last or it's the same block and selection moves forward inside the block.
      // Backward means the selection is from last to first.
      const forward = anchorIndex < headIndex
        || (anchorIndex === headIndex && item.anchor.offset <= item.head.offset);
      const start = forward ? item.anchor : item.head;
      const end = forward ? item.head : item.anchor;
      // Result is from first to last, including blocks in between
      return {
        start: { ...start },
        end: { ...end },
        blocks: all.slice(Math.min(anchorIndex, headIndex), Math.max(anchorIndex, headIndex) + 1),
      };
    };

    // Create ranges list without empty ranges
    const ranges = selection.flatMap((item) => {
      const range = normalizeItem(item);
      return range ? [range] : [];
    });
    if (!ranges.length) return undefined;

    // If selection has only block selections
    if (isStructuralSelection(selection)) {
      // Get all blocks ids that are selected from all ranges and put inside set
      // Needed because several ranges might overlap and we need to get all blocks that are selected.
      const selected = new Set(ranges.flatMap((range) => range.blocks.map((block) => block.id)));
      // Get all blocks that are selected and additionally exclude unexisting blocks.
      // And them sort by document order.
      const blocks = all.filter((block) => selected.has(block.id));
      const first = blocks[0];
      const last = blocks.at(-1);
      return first && last ? {
        start: { blockId: first.id, offset: 0 },
        end: { blockId: last.id, offset: last.content.length },
        blocks,
      } : undefined;
    }
    // Text or mixed: earliest..latest, including blocks in between
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
    // Text or mixed: return the first and last block and blocks in between
    // Merging text items and block items into consecutive range.
    // Because browser can select text in non-consecutive blocks and we need to merge them into one range.
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
    // Returns ordered and existing blocks ids for each selection item.
    const normalized = selection.map((item): EditorSelectionItem => {
      if (!item || !["text", "block"].includes(item.type)) throw new Error("Invalid selection");
      // Text selection is just a pair of positions.
      if (item.type === "text") {
        // Just validate types and block exists
        this.validatePosition(item.anchor.blockId, item.anchor.offset);
        this.validatePosition(item.head.blockId, item.head.offset);
        return item;
      }

      if (!item.blockIds.length) throw new Error("Selection requires at least one block");
      item.blockIds.forEach((id) => {
        if (!this.editor.blocks.getBlock(id)) throw new Error(`Selection block ${id} not found`);
      });
      // We check by includes because we can select in order 1, 3, 10 or 3, 10, 1
      // So we can have non-consecutive blocks selected.
      if (!item.blockIds.includes(item.anchorBlockId) || !item.blockIds.includes(item.focusBlockId)) {
        throw new Error("Block selection endpoints must be selected");
      }

      const selected = new Set(item.blockIds);
      const ordered: string[] = [];
      // Visit all blocks and add them to the ordered array if they are selected
      // Also filter blocks that don't exist.
      const visit = (blocks: Block[]): void => blocks.forEach((block) => {
        if (selected.has(block.id)) ordered.push(block.id);
        visit(block.children);
      });
      visit(this.editor.blocks.getBlocks());
      return { ...item, blockIds: ordered };
    });

    // Save copy of normalized selection
    this.value = normalized.map(cloneSelection);
    this.notify();
  }

  /**
   * Deletes the current text or structural selection as one undoable action.
   *
   * Text ranges collapse at their surviving start boundary. Whole-block
   * selections remove complete subtrees and focus the nearest surviving block.
   * Removing every root leaves a valid empty document and clears the selection.
   */
  delete(): void {
    const current = this.get();
    // Normalize selection with gaps for block selection and without for text selection (plus offsets).
    const range = this.normalize(current);
    if (!range) return;

    this.editor.history.stopCapturing();
    try {
      // If selection has only block selections
      if (isStructuralSelection(current)) {
        // Get all blocks in document order before removal
        const visibleBefore = flattenBlocks(this.editor.blocks.getBlocks());
        // Find document index of first removal block
        const firstRemovedIndex = Math.max(
          0,
          visibleBefore.findIndex((block) => block.id === range.blocks[0]?.id),
        );
        let caretBlockId: string | undefined = undefined;
        this.editor.document.transact(() => {
          // Remove all blocks in selection (because only blocks inside selection without text)
          range.blocks.forEach((block) => this.editor.document.blocks.removeBlock(block.id));
          // Get all blocks in document order after removal
          const remaining = flattenBlocks(this.editor.blocks.getBlocks());
          caretBlockId = remaining[Math.min(firstRemovedIndex, remaining.length - 1)]?.id;
        });
        if (caretBlockId) {
          this.collapse(caretBlockId, 0);
        } else {
          this.clear();
        }
        return;
      }

      // If selection has items with text selections
      const target = range.blocks[0]!;
      const end = range.blocks.at(-1) ?? target;
      const prefix = target.content.slice(0, range.start.offset);
      const suffix = end.content.slice(range.end.offset);
      this.editor.document.transact(() => {
        // Remove all blocks in selection keep only first block and merge text into it.
        // E.g. we have 4 blocks and selection keeps first part from first block and last part from last block.
        // 1. "The" 2. "quick" 3. "brown" 4. "fox" and selection is start 1. offset 2 and end 4 offset 1.
        // The results after removal and text merge will be: 1. "Thox" (remaining part of "The" and "fox") with id of first block
        range.blocks.slice(1).forEach((block) => this.editor.document.blocks.removeBlock(block.id));
        this.editor.document.blocks.setBlockText(target.id, prefix + suffix);
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
    return this.listeners.subscribe("selectionChanged", listener);
  }

  /** Notifies a stable listener snapshot so callbacks can unsubscribe safely. */
  private notify(): void {
    this.listeners.emit("selectionChanged");
  }

  /** Publishes a collapsed text caret without exposing mutable point objects. 
   * 
   * @param blockId - Block id to collapse to.
   * @param offset - Offset to collapse to.
   * This method is used to collapse text selection to a single block and offset (caret position).
  */
  private collapse(blockId: string, offset: number): void {
    this.set([{
      type: "text",
      anchor: { blockId, offset },
      head: { blockId, offset },
    }]);
  }

  /** Validates one UTF-16 position against current block content. */
  private validatePosition(blockId: string, offset: number): void {
    const block = this.editor.blocks.getBlock(blockId);
    if (!block) throw new Error(`Selection block ${blockId} not found`);
    if (!Number.isInteger(offset) || offset < 0 || offset > block.content.length) {
      throw new Error(`Selection offset ${offset} is outside block ${blockId}`);
    }
  }
}

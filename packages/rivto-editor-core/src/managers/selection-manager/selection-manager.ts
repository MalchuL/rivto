/**
 * Local whole-block selection owned by one editor runtime.
 *
 * Selection is session state, not CRDT document state. `set`/`clear` no-op when
 * membership is unchanged so pointermove republishes do not wake subscribers.
 * React reads `snapshot()` and `isBlockSelected(id)` instead of cloning `get()`
 * on every store poll.
 */
import {
  BlockSelection,
  type BlockSelectionInput,
  type EditorSelection,
} from "../../editor/types";
import type { EditorRuntime } from "../../editor/rivto-editor";
import type { Block } from "@chulane/document-model";
import { Listeners } from "../../utils";
import type { NormalizedSelection } from "./types";

/**
 * Flattens detached blocks in depth-first document order.
 * @param blocks - Document forest to visit.
 * @returns Ordered blocks, including descendants.
 */
function flattenBlocks(blocks: Block[]): Block[] {
  return blocks.flatMap((block) => [block, ...flattenBlocks(block.children)]);
}

/**
 * Detaches a whole-block item from caller-owned arrays.
 * @param selection - Item to copy.
 * @returns Independent item retaining direction and membership.
 */
function cloneSelection(selection: BlockSelection): BlockSelection {
  return selection.clone();
}

/**
 * Returns whether two ordered selection lists are identical.
 *
 * @param left - First list.
 * @param right - Second list.
 * @returns True when lengths and every item match.
 */
function sameSelection(left: readonly BlockSelection[], right: readonly BlockSelection[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item.equals(right[index]!));
}

/**
 * Collects IDs that belong to whole-block selection items.
 *
 * Text carets and ranges are excluded so block chrome does not light up while
 * the user is editing inside a block.
 *
 * @param selection - Current selection list.
 * @returns Unique selected block IDs.
 */
function selectedBlockIdsOf(selection: readonly BlockSelection[]): Set<string> {
  const ids = new Set<string>();
  for (const item of selection) {
    for (const id of item.blockIds) ids.add(id);
  }
  return ids;
}

/**
 * Owns an ordered list of detached local selection items.
 *
 * Selection is local editor-session state. It is intentionally not stored in
 * the collaborative document, because each user/view can have different active
 * whole-block selections over the same document.
 *
 * The manager belongs to one EditorRuntime, so `set()` can validate block IDs,
 * endpoint membership, and document order before publishing state.
 * Unchanged `set`/`clear` do not notify, and `snapshot()` / `isBlockSelected()`
 * give React a stable identity until membership actually changes.
 */
export class SelectionManager {
  private value: BlockSelection[] = [];
  private selectedBlockIds = new Set<string>();
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
   * Selected block arrays are copied so callers cannot
   * mutate manager state without going through `set` and notifying subscribers.
   */
  get(): BlockSelection[] {
    return this.value.map(cloneSelection);
  }

  /**
   * Returns the stored selection list without cloning.
   *
   * React `useSyncExternalStore` compares this by identity. The array is
   * replaced only when `set`/`clear` actually change membership, so subscribers
   * skip re-render on repeated identical publishes.
   *
   * @returns Current selection; treat as immutable.
   */
  snapshot(): BlockSelection[] {
    return this.value;
  }

  /**
   * Reports whether a block is in an active whole-block selection.
   *
   * Text carets and text ranges return false even when an endpoint sits in
   * `id`, matching `useBlockSelection`'s rule that a caret must not paint the
   * complete block as selected.
   *
   * @param id - Stable block ID.
   * @returns True only while a block-selection item contains `id`.
   */
  isBlockSelected(id: string): boolean {
    return this.selectedBlockIds.has(id);
  }

  /**
   * Resolves selected blocks without filling gaps.
   * @param selection - Optional whole-block selection override.
   * @returns Detached selected blocks in document order, or undefined if empty.
   */
  normalize(selection: EditorSelection = this.value): NormalizedSelection | undefined {
    const ids = new Set(selection.flatMap((item) => item.blockIds));
    const blocks = flattenBlocks(this.editor.blocks.getBlocks()).filter((block) => ids.has(block.id));
    return blocks.length ? { blocks } : undefined;
  }

  /**
   * Replaces every selection item with detached copies and notifies subscribers.
   *
   * Block selection direction is preserved, so UI can tell whether the user dragged
   * top-to-bottom or bottom-to-top. Identical membership after normalization
   * does not notify, so pointermove republishes stay off React.
   *
   * @param selection - Local selection list to validate and publish.
   */
  set(selection: readonly BlockSelectionInput[]): void {
    if (!Array.isArray(selection)) throw new Error("Selection must be a list");
    // Returns ordered and existing blocks ids for each selection item.
    const normalized = selection.map((item): BlockSelection => {
      if (!item || item.type !== "block" || !Array.isArray(item.blockIds)) {
        throw new Error("Selection accepts whole blocks only");
      }
      if (!item.blockIds.length) throw new Error("Selection requires at least one block");
      item.blockIds.forEach((id: string) => {
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
      return new BlockSelection({ ...item, blockIds: ordered });
    });
    if (sameSelection(this.value, normalized)) return;

    this.value = normalized.map(cloneSelection);
    this.selectedBlockIds = selectedBlockIdsOf(this.value);
    this.notify();
  }

  /**
   * Removes selected subtrees and clears selection as one undoable action.
   * @returns No value.
   */
  delete(): void {
    const range = this.normalize();
    if (!range) return;
    this.editor.batchUpdates(() => {
      range.blocks.forEach((block) => this.editor.document.blocks.removeBlock(block.id));
      this.clear();
    });
  }

  /** Clears an active selection without notifying when selection is already empty. */
  clear(): void {
    if (!this.value.length) return;
    this.value = [];
    this.selectedBlockIds = new Set();
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

}

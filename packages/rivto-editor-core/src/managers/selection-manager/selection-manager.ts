/**
 * Owns local selection for one editor runtime: blocks, canvas elements, and
 * plugin-owned data.
 *
 * Every selected block stores absolute `[start, end)` offsets. `end: -1` is the
 * only sentinel and means the live end of the block. Invalid offsets copy and
 * delete as an empty slice.
 */
import type { Block } from "@chulane/document-model";
import type { EditorRuntime } from "../../editor/rivto-editor";
import { Listeners } from "../../utils";
import type { Selection } from "./selection";
import type { ResolvedSelection } from "./resolved-selection";
import {
  createCaretSelection,
  assertBlockRangeEndpoints,
  isStructuralSelection,
  resolveBlockRange,
  getSelectedBlockIds,
} from "./selection-ranges";

/** Local selection manager shared by core commands and browser adapters. */
export class SelectionManager {
  private value: Selection | undefined;
  private selectedBlockIds = new Set<string>();
  private selectedElementIds = new Set<string>();
  private readonly listeners = new Listeners<{ selectionChanged: void }>();

  /**
   * Creates a manager for one runtime.
   * @param editor - Runtime providing current blocks and mutations.
   */
  constructor(private readonly editor: EditorRuntime) {}

  /** @returns Detached current selection. */
  get(): Selection | undefined {
    return this.value ? this.cloneSelection(this.value) : undefined;
  }

  /** @returns Stable selection snapshot; callers must treat it as immutable. */
  snapshot(): Selection | undefined {
    return this.value;
  }

  /**
   * Reports whether one member is stored as complete coverage (`start: 0`, `end: -1`).
   * Other members of the same selection may still be partial text ranges.
   * @param id - Stable block ID.
   * @returns Whether that block should show structural selection chrome.
   */
  isBlockSelected(id: string): boolean {
    return this.selectedBlockIds.has(id);
  }

  /**
   * Reports whether the generic selection contains an element ID.
   * @param id - Stable first-class element ID.
   * @returns Whether the element is selected.
   */
  isElementSelected(id: string): boolean {
    return this.selectedElementIds.has(id);
  }

  /**
   * Resolves stored offsets against live content. Member order follows
   * `selection.blocks`; `set()` already puts that array in document order.
   * @param selection - Optional selection override.
   * @returns Resolved selection, or undefined when no block members survive lookup.
   */
  resolveBlockSelection(selection: Selection | undefined = this.value): ResolvedSelection | undefined {
    if (!selection?.blocks.length) return undefined;
    const all = this.flattenBlocks(this.editor.blocks.getBlocks());
    const byId = new Map(all.map((block) => [block.id, block]));
    const members = selection.blocks.flatMap((entry) => {
      const block = byId.get(entry.id);
      if (!block) return [];
      // `end: -1` becomes the live length. Invalid offsets become an empty
      // slice at a clamped caret instead of throwing.
      const range = resolveBlockRange(block.content.length, entry.start, entry.end);
      return [{ entry, block, range }];
    });
    if (!members.length) return undefined;
    const first = members[0]!;
    const last = members.at(-1)!;
    const ranges = members.map(({ block, range }) => ({
      block,
      startOffset: range.startOffset,
      endOffset: range.endOffset,
      invalid: range.invalid,
    }));
    // Classify from stored sentinels. Resolved ranges always use concrete
    // lengths, so `{ start: 0, end: -1 }` would look like a full-text range.
    const startsWithText = !isStructuralSelection(selection);
    return {
      start: { blockId: first.block.id, offset: first.range.startOffset },
      end: { blockId: last.block.id, offset: last.range.endOffset },
      blocks: members.map(({ block }) => block),
      ranges,
      startsWithText,
    };
  }

  /**
   * Validates IDs, orders block membership, and publishes selection.
   * Offsets are stored as given; consumers resolve them against live lengths.
   * @param selection - Local selection value to publish.
   * @returns No value.
   */
  set(selection: Selection): void {
    const all = this.flattenBlocks(this.editor.blocks.getBlocks());
    const item = selection;
    if (!item || item.type !== "selection" || !Array.isArray(item.blocks)) throw new Error("Invalid selection");
    if (item.blocks.length) {
      assertBlockRangeEndpoints(item);
      if (!this.editor.blocks.getBlock(item.anchorBlockId) || !this.editor.blocks.getBlock(item.focusBlockId)) {
        throw new Error(`Selection block ${item.anchorBlockId} not found`);
      }
      const ids = getSelectedBlockIds(item);
      if (!ids.includes(item.anchorBlockId) || !ids.includes(item.focusBlockId)) {
        throw new Error("Block selection endpoints must be selected");
      }
    }
    item.blocks.forEach((block) => {
      if (!this.editor.blocks.getBlock(block.id)) throw new Error(`Selection block ${block.id} not found`);
    });
    const byId = new Map(item.blocks.map((block) => [block.id, block]));
    const blocks = all.flatMap((block) => {
      const entry = byId.get(block.id);
      return entry ? [{ id: block.id, start: entry.start, end: entry.end }] : [];
    });
    (item.elements ?? []).forEach((id) => {
      if (!this.editor.elements.getElement(id)) throw new Error(`Selection element ${id} not found`);
    });
    const elements = [...(item.elements ?? [])];
    if (!blocks.length && !elements.length && !Object.keys(item.pluginData ?? {}).length) {
      throw new Error("Selection requires blocks, elements, or plugin data");
    }
    const normalized = this.cloneSelection({ ...item, blocks, elements });
    if (this.sameSelection(this.value, normalized)) return;
    this.value = this.cloneSelection(normalized);
    this.selectedBlockIds = new Set(this.value.blocks.flatMap((block) => (
      block.start === 0 && block.end === -1 ? [block.id] : []
    )));
    this.selectedElementIds = new Set(this.value.elements ?? []);
    this.notify();
  }

  /**
   * Deletes complete blocks or the covered text range atomically, and removes
   * any selected elements in the same batch.
   *
   * Invalid offsets (reversed, non-integer, or outside the live length) splice
   * as an empty slice on that block instead of aborting the whole operation.
   * @returns No value.
   */
  delete(): void {
    const current = this.get();
    const range = this.resolveBlockSelection(current);
    const elementIds = [...new Set(current?.elements ?? [])];
    if (!range && !elementIds.length) return;
    // Whole-block coverage, or elements with no surviving blocks, must drop
    // those entities rather than splice characters. Element IDs travel with
    // either branch so mixed canvas+page selections stay one undo step.
    if (!range || isStructuralSelection(current)) {
      this.editor.batchUpdates(() => {
        range?.blocks.forEach((block) => this.editor.document.blocks.removeBlock(block.id));
        this.editor.document.elements.removeElements(elementIds);
        this.clear();
      });
    } else {
      // Keep the first block and join the surviving prefix/suffix. Invalid or
      // reversed offsets resolve to an empty slice, so this is still a no-op
      // splice at a clamped caret instead of aborting the transaction.
      const first = range.ranges[0]!;
      const last = range.ranges.at(-1)!;
      const prefix = first.block.content.slice(0, first.startOffset);
      const suffix = last.block.content.slice(last.endOffset);
      this.editor.batchUpdates(() => {
        range.blocks.slice(1).forEach((block) => this.editor.document.blocks.removeBlock(block.id));
        this.editor.document.blocks.setBlockText(first.block.id, prefix + suffix);
        this.editor.document.elements.removeElements(elementIds);
        this.collapse(first.block.id, prefix.length);
      });
    }
  }

  /** Clears selection without notifying when already empty. */
  clear(): void {
    if (!this.value) return;
    this.value = undefined;
    this.selectedBlockIds = new Set();
    this.selectedElementIds = new Set();
    this.notify();
  }

  /**
   * Subscribes to selection changes.
   * @param listener - Callback invoked after an effective change.
   * @returns Function that removes the listener.
   */
  subscribe(listener: () => void): () => void {
    return this.listeners.subscribe("selectionChanged", listener);
  }

  /**
   * Returns whether two selection values serialize identically.
   * @param left - First selection.
   * @param right - Second selection.
   * @returns Whether every stored field matches.
   */
  private sameSelection(left: Selection | undefined, right: Selection | undefined): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  /**
   * Clones a selection at the manager boundary.
   * @param selection - Local selection value to detach.
   * @returns A value whose mutable arrays and plugin data are independently owned.
   */
  private cloneSelection(selection: Selection): Selection {
    return {
      type: "selection",
      blocks: selection.blocks.map((block) => ({ ...block })),
      anchorBlockId: selection.anchorBlockId,
      focusBlockId: selection.focusBlockId,
      reversed: selection.reversed === true,
      elements: [...(selection.elements ?? [])],
      pluginData: structuredClone(selection.pluginData ?? {}),
    };
  }

  /**
   * Flattens detached blocks in depth-first document order.
   * @param blocks - Document forest to visit.
   * @returns Ordered blocks, including descendants.
   */
  private flattenBlocks(blocks: Block[]): Block[] {
    return blocks.flatMap((block) => [block, ...this.flattenBlocks(block.children)]);
  }

  /** Notifies a stable listener snapshot. */
  private notify(): void {
    this.listeners.emit("selectionChanged");
  }

  /**
   * Publishes a collapsed caret.
   * @param blockId - Existing caret block.
   * @param offset - UTF-16 caret offset.
   */
  private collapse(blockId: string, offset: number): void {
    this.set(createCaretSelection(blockId, offset));
  }
}

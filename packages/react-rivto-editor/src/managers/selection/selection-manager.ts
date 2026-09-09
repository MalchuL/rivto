/**
 * Resolves browser editing context separately from core whole-block selection.
 * Only one single-block text range is retained across DOM reconciliation.
 * It never enters core selection, and mixed or cross-block text input is rejected.
 * Clipboard and keyboard operations consume this host context explicitly.
 */
import {
  BaseSelection,
  type BlockSelectionInput,
  type EditorPosition,
  type EditorSelection,
  type TextRange,
} from "@chulane/rivto";
import type { SelectionCapability } from "../../capabilities";
import type { ReactEditorImpl } from "../../react-editor";
import { readEditorDOMSelection, restoreEditorDOMSelection } from "./editor-dom-selection";

/** Plain browser text selection accepted at public mutation boundaries. */
export type TextSelectionInput = TextRange;

/** Browser-owned text selection over one editable block. */
export class TextSelection extends BaseSelection<"text"> implements TextRange {
  /** Browser text selection discriminator. */
  readonly type = "text";
  /** Endpoint where the gesture began. */
  readonly anchor: EditorPosition;
  /** Active endpoint of the gesture. */
  readonly head: EditorPosition;

  /**
   * Creates a browser text selection detached from its input positions.
   * @param input - Directed text range supplied by the browser host.
   */
  constructor(input: TextSelectionInput) {
    super();
    this.anchor = { ...input.anchor };
    this.head = { ...input.head };
  }

  /**
   * Compares both directed text endpoints.
   * @param other - Runtime selection to compare.
   * @returns Whether both selections contain identical endpoints.
   */
  equals(other: BaseSelection): boolean {
    return other instanceof TextSelection
      && this.anchor.blockId === other.anchor.blockId
      && this.anchor.offset === other.anchor.offset
      && this.head.blockId === other.head.blockId
      && this.head.offset === other.head.offset;
  }

  /**
   * Creates a detached copy of this browser selection.
   * @returns Independent text selection.
   */
  clone(): TextSelection {
    return new TextSelection(this);
  }
}

/** Browser operation context: block items or one single-block editing range. */
export type ReactSelection = EditorSelection | [TextSelectionInput];

/** Plain or instantiated selection values accepted by the React bridge. */
export type ReactSelectionInput = readonly (BlockSelectionInput | TextSelectionInput)[];

/** DOM editing bridge over the core whole-block selection manager. */
export class ReactSelectionManager implements SelectionCapability {
  private text: TextSelection | undefined;
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribeBlocks: () => void;

  /**
   * Creates a bridge scoped to one React runtime.
   * @param reactEditor - Runtime providing core blocks and current DOM root.
   */
  constructor(private readonly reactEditor: ReactEditorImpl) {
    this.unsubscribeBlocks = reactEditor.editor.selection.subscribe(() => {
      if (reactEditor.editor.selection.snapshot().length) this.text = undefined;
      this.listeners.forEach((listener) => listener());
    });
  }

  /**
   * Resolves current block selection or the last single-block editing range.
   * @returns Detached browser operation context; never a mixed selection.
   */
  get(): ReactSelection {
    const blocks = this.reactEditor.editor.selection.get();
    if (blocks.length) return blocks;
    const text = this.text;
    const block = text && this.reactEditor.editor.blocks.getBlock(text.anchor.blockId);
    return text && block ? [new TextSelection({
      type: "text",
      anchor: { blockId: block.id, offset: Math.min(text.anchor.offset, block.content.length) },
      head: { blockId: block.id, offset: Math.min(text.head.offset, block.content.length) },
    })] : [];
  }

  /**
   * Updates browser editing context or publishes whole-block selection.
   * @param selection - Whole-block items or exactly one single-block text range.
   * @returns No value.
   * @throws When text spans blocks, has invalid offsets, or is mixed with blocks.
   */
  set(selection: ReactSelectionInput): void {
    const text = selection.find((item): item is TextSelectionInput => item.type === "text");
    if (text) {
      const block = this.reactEditor.editor.blocks.getBlock(text.anchor.blockId);
      if (selection.length !== 1 || !block || text.head.blockId !== block.id ||
        ![text.anchor.offset, text.head.offset].every((offset) =>
          Number.isInteger(offset) && offset >= 0 && offset <= block.content.length)) {
        throw new Error("Browser text ranges must stay inside one existing block");
      }
      const next = new TextSelection(text);
      if (this.text?.equals(next)) return;
      const hadBlocks = this.reactEditor.editor.selection.snapshot().length > 0;
      this.text = next;
      this.reactEditor.editor.selection.clear();
      if (!hadBlocks) this.listeners.forEach((listener) => listener());
    } else {
      const hadText = Boolean(this.text);
      this.reactEditor.editor.selection.set(selection as readonly BlockSelectionInput[]);
      this.text = undefined;
      if (hadText && !selection.length) this.listeners.forEach((listener) => listener());
    }
  }

  /**
   * Clears both browser editing context and whole-block selection.
   * @returns No value.
   */
  clear(): void {
    this.set([]);
  }

  /**
   * Watches host editing context and core block selection.
   * @param listener - Callback after either context changes.
   * @returns Disposer for both subscriptions.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /**
   * Releases the core subscription and retained browser editing context.
   * @returns No value.
   */
  destroy(): void {
    this.unsubscribeBlocks();
    this.listeners.clear();
    this.text = undefined;
  }

  /**
   * Deletes an explicit single-block range or the active whole-block selection.
   * @returns No value.
   */
  delete(): void {
    const text = this.get().find((item): item is TextSelection => item.type === "text");
    if (text) {
      const start = Math.min(text.anchor.offset, text.head.offset);
      const end = Math.max(text.anchor.offset, text.head.offset);
      if (start === end) return;
      const block = this.reactEditor.editor.blocks.getBlock(text.anchor.blockId)!;
      this.reactEditor.editor.batchUpdates(() => {
        this.reactEditor.editor.blocks.updateBlock(block.id, {
          content: block.content.slice(0, start) + block.content.slice(end),
        });
      });
      this.set([new TextSelection({ type: "text", anchor: { blockId: block.id, offset: start },
        head: { blockId: block.id, offset: start } })]);
    } else {
      this.reactEditor.editor.selection.delete();
      this.text = undefined;
    }
  }

  /**
   * Reads current native endpoints, projecting cross-block ranges to blocks.
   * @returns Browser operation context, or undefined outside this editor.
   */
  readDOM(): ReactSelection | undefined {
    const root = this.reactEditor.events.getRoot();
    return root ? readEditorDOMSelection(root) : undefined;
  }

  /**
   * Restores a single-block editing range after DOM reconciliation.
   * @param selection - Captured editing context, defaulting to current state.
   * @returns Whether both text endpoints could be restored.
   */
  restoreDOM(selection: ReactSelection = this.get()): boolean {
    const root = this.reactEditor.events.getRoot();
    return root ? restoreEditorDOMSelection(root, selection) : false;
  }
}

/**
 * Bridges core selection state to browser DOM selection.
 *
 * Core owns block selection with per-block offsets. React only reads native
 * endpoints and restores them after rendering.
 */
import type { RivtoEditorApi, Selection } from "@chulane/rivto";
import type { SelectionCapability } from "../../capabilities";
import type { ReactEditorImpl } from "../../react-editor";
import { readEditorDOMSelection, restoreEditorDOMSelection } from "./editor-dom-selection";

export { createCaretSelection, createTextSelection } from "@chulane/rivto";

/** DOM adapter over the core selection manager. */
export class ReactSelectionManager implements SelectionCapability {
  /**
   * Creates a bridge scoped to one React runtime.
   * @param reactEditor - Owning React runtime providing the active DOM root.
   * @param editor - Core runtime providing selection state.
   */
  constructor(
    private readonly reactEditor: ReactEditorImpl,
    private readonly editor: RivtoEditorApi,
  ) {}

  /** @returns Detached current selection. */
  get(): Selection | undefined {
    return this.editor.selection.get();
  }

  /**
   * Publishes block selection through core.
   * @param selection - Local selection values.
   * @returns No value.
   */
  set(selection: Selection): void {
    this.editor.selection.set(selection);
  }

  /** Clears local selection. */
  clear(): void {
    this.editor.selection.clear();
  }

  /**
   * Subscribes to local selection changes.
   * @param listener - Callback invoked after an effective change.
   * @returns Function that removes the listener.
   */
  subscribe(listener: () => void): () => void {
    return this.editor.selection.subscribe(listener);
  }

  /** Deletes the current selection through core. */
  delete(): void {
    this.editor.selection.delete();
  }

  /** @returns Stable core selection snapshot. */
  snapshot(): Selection | undefined { return this.editor.selection.snapshot(); }

  /** @returns Whether a block has structural selection coverage. */
  isBlockSelected(id: string): boolean { return this.editor.selection.isBlockSelected(id); }

  /** @returns Whether an element belongs to the current selection. */
  isElementSelected(id: string): boolean { return this.editor.selection.isElementSelected(id); }

  /**
   * Reads current native endpoints.
   * @returns Browser selection, or undefined outside this editor.
   */
  readDOM(): Selection | undefined {
    const root = this.reactEditor.events.getRoot();
    return root ? readEditorDOMSelection(root) : undefined;
  }

  /**
   * Restores a non-structural range after DOM reconciliation.
   * @param selection - Selection to restore, defaulting to current state.
   * @returns Whether both text endpoints could be restored.
   */
  restoreDOM(selection: Selection | undefined = this.get()): boolean {
    const root = this.reactEditor.events.getRoot();
    return root && selection ? restoreEditorDOMSelection(root, selection) : false;
  }
}

/**
 * Bridges core selection state to browser DOM selection.
 *
 * Core owns block selection with per-block offsets. React only reads native
 * endpoints and restores them after rendering.
 */
import type { Selection } from "@chulane/rivto";
import type { SelectionCapability } from "../../capabilities";
import type { ReactEditorImpl } from "../../react-editor";
import { readEditorDOMSelection, restoreEditorDOMSelection } from "./editor-dom-selection";

export { createCaretSelection, createTextSelection } from "@chulane/rivto";

/** DOM adapter over the core selection manager. */
export class ReactSelectionManager implements SelectionCapability {
  /**
   * Creates a bridge scoped to one React runtime.
   * @param reactEditor - Runtime providing core selection and the DOM root.
   */
  constructor(private readonly reactEditor: ReactEditorImpl) {}

  /** @returns Detached current selection. */
  get(): Selection | undefined {
    return this.reactEditor.editor.selection.get();
  }

  /**
   * Publishes block selection through core.
   * @param selection - Local selection values.
   * @returns No value.
   */
  set(selection: Selection): void {
    this.reactEditor.editor.selection.set(selection);
  }

  /** Clears local selection. */
  clear(): void {
    this.reactEditor.editor.selection.clear();
  }

  /**
   * Subscribes to local selection changes.
   * @param listener - Callback invoked after an effective change.
   * @returns Function that removes the listener.
   */
  subscribe(listener: () => void): () => void {
    return this.reactEditor.editor.selection.subscribe(listener);
  }

  /** Releases no resources because core owns the only subscription store. */
  destroy(): void {}

  /** Deletes the current selection through core. */
  delete(): void {
    this.reactEditor.editor.selection.delete();
  }

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

import type {
  EditorSelection,
} from "@chulane/rivto";
import type { ReactEditor } from "../../../react-editor";
import {
  clearTextSelectionHighlight,
  readEditorDOMSelection,
  restoreEditorDOMSelection,
  updateTextSelectionHighlight,
} from "./utils/editor-dom-selection";

/**
 * Bridges core structured selection with the active React surface DOM.
 *
 * Structured selection storage, validation, subscriptions, and mutations belong
 * to the core editor. This manager owns only browser-DOM conversion, restoration,
 * and supplemental cross-block highlighting for the active React surface.
 */
export class ReactSelectionManager {
  /**
   * Creates a DOM-aware facade over the core selection manager.
   *
   * @param reactEditor - Complete owning runtime. Core selection and the active
   * DOM root are resolved lazily from it.
   */
  constructor(private readonly reactEditor: ReactEditor) {}

  /** @returns Portable native selection, or undefined without valid root endpoints. */
  readDOM(): EditorSelection | undefined {
    const root = this.reactEditor.events.getRoot();
    return root ? readEditorDOMSelection(root) : undefined;
  }

  /**
   * Restores a structured text selection into the current surface DOM.
   *
   * @param selection - Selection to restore; defaults to current core state.
   * @returns True when visible text endpoints were resolved.
   */
  restoreDOM(selection: EditorSelection = this.reactEditor.editor.selection.get()): boolean {
    const root = this.reactEditor.events.getRoot();
    return root ? restoreEditorDOMSelection(root, selection) : false;
  }

  /** Removes supplemental cross-block highlighting from the current root. */
  clearDOMHighlight(): void {
    const root = this.reactEditor.events.getRoot();
    if (root) clearTextSelectionHighlight(root);
  }

  /**
   * Repaints supplemental highlighting from structured selection state.
   *
   * @param selection - Selection to paint; defaults to current core state.
   */
  updateDOMHighlight(selection: EditorSelection = this.reactEditor.editor.selection.get()): void {
    const root = this.reactEditor.events.getRoot();
    if (root) updateTextSelectionHighlight(root, selection);
  }
}

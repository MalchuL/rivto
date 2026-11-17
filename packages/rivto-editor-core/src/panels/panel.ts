import type { DocumentModel } from "@chulane/document-model";
import type { DocumentEditorAPI } from "../editor/types";
import type { EditorSnapshot, EditorSnapshotUpdate } from "../editor/model";
import { PanelSelection } from "./panel-selection";
import { ClipboardManager } from "../managers/clipboard-manager/clipboard-manager";
import { PanelElements } from "./panel-elements";
import { PanelBlocks } from "./panel-blocks";
import type { PanelAPI, PanelOptions } from "./types";

/**
 * Borrows one document editor and exposes bounded operations without subscriptions
 * or document mutations during construction.
 *
 * Block and element boundaries are independent and fixed for this panel's lifetime.
 * Subclasses supply the block visibility and root-protection policy. The caller
 * retains ownership of the document editor; this panel never destroys it.
 */
export abstract class Panel implements PanelAPI {
  readonly blocks: PanelBlocks;
  /** Fixed block boundary, or undefined to expose the document's block roots. */
  readonly rootBlockId: string | undefined;
  /** Fixed element container, excluded from element operations; null selects document roots. */
  readonly rootElementId: string | null;
  /** Reads and mutations limited to descendants of the fixed element container. */
  readonly elements: PanelElements;
  /** Selection commands constrained to this panel. */
  readonly selection: PanelSelection;
  /** Clipboard commands constrained to this panel and using shared strategies. */
  readonly clipboard: ClipboardManager;
  private readonly subscriptions = new Set<() => void>();
  /**
   * Creates element operations and records the selected subtree boundaries.
   *
   * @param document - Permanently bound editor, owned by the caller.
   * @param options - Independent subtree boundaries; omitted or null roots select the source editor's roots.
   * @param blocks - Concrete panel's boundary and root-protection policy.
   */
  protected constructor(
    readonly document: DocumentEditorAPI,
    options: PanelOptions,
    blocks: PanelBlocks,
  ) {
    this.blocks = blocks;
    this.rootBlockId = blocks.rootBlockId ?? undefined;
    this.rootElementId =
      options.rootElementId ??
      (document.elements instanceof PanelElements ? document.elements.rootElementId : null);
    this.elements = new PanelElements(document, this.rootElementId);
    this.selection = new PanelSelection(this, getSourceEditor(document).selection);
    this.clipboard = new ClipboardManager(this, document.clipboard.pasteStrategies);
  }
  /**
   * Reads the source editor's block definitions and structural behaviors.
   *
   * @returns The shared value; its lifecycle remains with the source editor.
   */
  get blockRegistry(): DocumentEditorAPI["blockRegistry"] {
    return this.document.blockRegistry;
  }
  /**
   * Reads the source editor's block list-property policy.
   *
   * @returns The shared value; its lifecycle remains with the source editor.
   */
  get blockListProps(): DocumentEditorAPI["blockListProps"] {
    return this.document.blockListProps;
  }
  /**
   * Reads the source editor's element definitions.
   *
   * @returns The shared value; its lifecycle remains with the source editor.
   */
  get elementRegistry(): DocumentEditorAPI["elementRegistry"] {
    return this.document.elementRegistry;
  }
  /**
   * Reads the source editor's named commands.
   *
   * @returns The shared value; its lifecycle remains with the source editor.
   */
  get commands(): DocumentEditorAPI["commands"] {
    return this.document.commands;
  }
  /**
   * Reads the source editor's history and transaction batching.
   *
   * @returns The shared value; its lifecycle remains with the source editor.
   */
  get history(): DocumentEditorAPI["history"] {
    return this.document.history;
  }
  /**
   * Reads the source editor's runtime revision.
   *
   * @returns The shared value; its lifecycle remains with the source editor.
   */
  get revision(): number {
    return this.document.revision;
  }
  /**
   * Observes the source editor's document-wide revision stream.
   *
   * @param listener - Callback invoked after a shared runtime revision changes.
   * @returns Disposer also released when this panel is destroyed.
   */
  subscribe(listener: () => void): () => void {
    const unsubscribe = getSourceEditor(this.document).subscribe(listener);
    this.subscriptions.add(unsubscribe);
    return () => {
      if (this.subscriptions.delete(unsubscribe)) {
        unsubscribe();
      }
    };
  }
  /**
   * Reads the underlying document model without applying panel boundaries.
   *
   * @returns The model borrowed from the source editor.
   */
  getDocument(): DocumentModel {
    return this.document.getDocument();
  }
  /**
   * Loads snapshot sections into the complete source document.
   *
   * @param snapshot - Document-wide snapshot sections to load.
   * @returns After loading and clearing the shared history baseline.
   * @throws If snapshot validation or the underlying document update fails.
   */
  load(snapshot: EditorSnapshotUpdate): void {
    this.document.load(snapshot);
  }
  /**
   * Materializes a snapshot of the complete source document.
   *
   * @returns Detached document-wide snapshot.
   */
  dump(): EditorSnapshot {
    return this.document.dump();
  }
  /**
   * Releases subscriptions owned by this panel's managers.
   *
   * The underlying editor, its processor registrations, and its document remain owned
   * by their creator and continue to be available to other panels.
   *
   * @returns A promise resolved after this panel's subscriptions and manager cleanup complete.
   * @throws AggregateError if any panel subscription or manager fails to release its resources.
   */
  async destroy(): Promise<void> {
    const errors: unknown[] = [];
    for (const unsubscribe of this.subscriptions) {
      try {
        unsubscribe();
      } catch (error) {
        errors.push(error);
      }
    }
    this.subscriptions.clear();
    for (const manager of [this.blocks, this.elements, this.selection]) {
      try {
        manager.destroy();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Panel manager cleanup failed");
    }
  }
  /** @inheritdoc PanelAPI.batchUpdates */
  batchUpdates<Result>(operation: () => Result): Result {
    return this.document.history.batchUpdates(operation);
  }
  /** @inheritdoc PanelAPI.batchUpdatesWithoutHistory */
  batchUpdatesWithoutHistory<Result>(operation: () => Result): Result {
    return this.document.history.batchUpdatesWithoutHistory(operation);
  }
  /**
   * Reads the identity of the model exposed by the borrowed editor.
   *
   * @returns Persisted identity of the borrowed document.
   */
  get documentId(): string {
    return this.document.getDocument().id;
  }
}

/**
 * Finds the editor that owns the shared revision and selection streams.
 *
 * Nested panels retain their own boundary checks, but subscriptions must not be
 * owned by an intermediate panel that can be destroyed independently.
 * @param editor - Borrowed source editor or panel.
 * @returns The first source that is not a panel.
 */
function getSourceEditor(editor: DocumentEditorAPI): DocumentEditorAPI {
  while (isPanel(editor)) {
    editor = editor.document;
  }
  return editor;
}

/**
 * Identifies a source exposing the panel boundary and borrowed editor contract.
 *
 * @param editor - Source to inspect.
 * @returns Whether the source is a panel rather than an editor runtime.
 */
function isPanel(editor: DocumentEditorAPI): editor is PanelAPI {
  return "document" in editor && "rootElementId" in editor;
}

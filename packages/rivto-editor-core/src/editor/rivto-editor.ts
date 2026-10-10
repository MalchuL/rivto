/**
 * Editor runtime coordinating document mutations and focused public managers.
 */
import { BlockListPropsManager, BlockManager, BlockRegistryManager, ClipboardManager, CommandRegistry, ElementManager, HistoryManager, ModeManager, SelectionManager } from "../managers";
import {
  type DocumentModel,
} from "@chulane/document-model";
import type { EditorSnapshot, EditorSnapshotUpdate } from "./model";
import type { CreateRivtoEditorOptions, RivtoEditorApi } from "./types";
import type { Selection } from "../managers/selection-manager";
import { Listeners } from "../utils";

/**
 * Coordinates editor lifecycle around focused public managers.
 *
 * Block APIs live exclusively on `.blocks`. The runtime
 * owns cross-cutting commands, selection, history, mode, document subscriptions,
 * clipboard bridges, and the shared revision stream.
 */
export class EditorRuntime implements RivtoEditorApi {
  /** Public owner of typed block operations. */
  readonly blocks: BlockManager;
  /** Public owner of list-property defaults and semantic validation. */
  readonly blockListProps: BlockListPropsManager;
  /** Public owner of native block definitions and property validation. */
  readonly blockRegistry: BlockRegistryManager;
  /** Public owner of first-class canvas element commands. */
  readonly elements: ElementManager;
  /** Named command handlers exposed to integrations and focused managers. */
  readonly commands = new CommandRegistry();
  /** Local presentation mode shared by views of this single-document runtime. */
  readonly mode: ModeManager;
  /** Local text and structural selection state; never persisted to the document. */
  readonly selection: SelectionManager;
  /** Local history and transaction batching for document changes. */
  readonly history: HistoryManager;
  /** Framework-neutral structured and plain-text clipboard operations. */
  readonly clipboard: ClipboardManager;
  /** Named subscribers notified whenever public runtime state changes. */
  private readonly listeners = new Listeners<{ editorChanged: void }>();
  /** Owned subscription cleanup callbacks called during `destroy()`. */
  private readonly unsubscribeFns: Array<() => void> = [];
  /** Monotonic snapshot incremented before notifying runtime subscribers. */
  private currentRevision = 0;
  private readonly document: DocumentModel;
  private destroyed = false;

  /**
   * Creates a single-document runtime with stable managers and local interaction state.
   *
   * @param options - Caller-owned document whose identity is fixed for this runtime; construction does not load other documents. The optional mode selects the initial local presentation.
   * @throws If the document is missing or runtime initialization fails.
   */
  constructor(options: CreateRivtoEditorOptions) {
    if (!options.document) throw new Error("Document is required");
    this.document = options.document;
    this.mode = new ModeManager(options.mode);
    this.history = new HistoryManager(this.document.history);
    this.blockRegistry = new BlockRegistryManager();
    this.blockListProps = new BlockListPropsManager();
    this.blocks = new BlockManager(this);
    this.elements = new ElementManager(this);
    this.selection = new SelectionManager(this);
    this.clipboard = new ClipboardManager(this);
    this.unsubscribeFns.push(
      this.mode.subscribe(() => {
        // A surface switch separates history captures without changing document data.
        this.history.stopCapturing();
        this.notifyChanges();
        this.history.stopCapturing();
      }),
      this.blockRegistry.subscribe(() => this.notifyChanges()),
      this.document.subscribe(() => this.notifyChanges()),
      this.document.blocks.subscribeStructure(() => this.reconcileDocumentSelection()),
      this.document.elements.subscribeMembership(() => this.reconcileDocumentSelection()),
    );
  }

  /**
   * Returns the current monotonic runtime revision.
   *
   * Changes in this document, local mode, and registered block definitions increment this value before
   * runtime subscribers are notified. Selection is excluded so caret and
   * block-range publishes do not invalidate the whole React tree.
   *
   * @returns Current editor revision.
   */
  get revision(): number { return this.currentRevision; }

  /**
   * Subscribes to runtime revision changes.
   *
   * Selection changes do not fire this stream. Subscribe to
   * `editor.selection` for caret and block-range updates.
   *
   * @param listener - Callback called after an observable runtime change.
   * @returns Function that removes this listener.
   */
  subscribe(listener: () => void): () => void {
    return this.listeners.subscribe("editorChanged", listener);
  }

  /** @returns The model permanently owned by this editor's document operations. */
  getDocument(): DocumentModel { return this.document; }

  /**
   * Replaces supplied document sections from a snapshot v6 update.
   *
   * Loading establishes a new history baseline, so earlier local changes
   * cannot be restored with undo.
   *
   * @param snapshot - Snapshot sections to validate and load.
   * @returns No value.
   * @throws When canonical snapshot validation fails or the CRDT cannot apply the update.
   */
  load(snapshot: EditorSnapshotUpdate): void {
    this.document.loadSnapshot(snapshot);
    this.history.clear();
  }

  /**
   * Materializes the complete portable document state.
   *
   * @returns Detached snapshot v6 suitable for persistence or transfer.
   */
  dump(): EditorSnapshot {
    return this.document.getSnapshot();
  }

  /**
   * Reconciles local selection with the latest document.
   *
   * Direct document edits, remote CRDT updates, and undo/redo can
   * remove selected blocks. Deleted IDs are filtered, and block selections
   * are reordered to match the current tree.
   * When a block-selection endpoint disappeared, its replacement is chosen
   * from the same directional edge so top-down and bottom-up intent survives.
   * All reads use the editor's permanently bound document.
   * @returns No value.
   */
  private reconcileDocumentSelection(): void {
    const selection = this.selection.get();
    if (!selection) return;
    const visibleIds = this.blocks.getOrderedIds(selection.blocks.map((block) => block.id));
    let changed = false;
    const valid = (() : Selection | undefined => {
      const item = selection;
      const selected = new Map(item.blocks.map((block) => [block.id, block]));
      const blocks = visibleIds.flatMap((id) => {
        const entry = selected.get(id);
        return entry ? [{ id: entry.id, start: entry.start, end: entry.end }] : [];
      });
      const elements = (item.elements ?? []).filter((id) => this.elements.hasElement(id));
      const hasPluginData = Object.keys(item.pluginData ?? {}).length > 0;
      if (!blocks.length && !elements.length && !hasPluginData) {
        changed = true;
        return undefined;
      }
      if (!blocks.length) {
        changed ||= elements.length !== (item.elements?.length ?? 0);
        return { ...item, blocks, elements };
      }
      const forward = item.blocks.findIndex((block) => block.id === item.anchorBlockId)
        <= item.blocks.findIndex((block) => block.id === item.focusBlockId);
      const ids = new Set(blocks.map((block) => block.id));
      let anchorBlockId = item.anchorBlockId;
      if (!anchorBlockId || !ids.has(anchorBlockId)) anchorBlockId = forward ? blocks[0]!.id : blocks.at(-1)!.id;
      let focusBlockId = item.focusBlockId;
      if (!focusBlockId || !ids.has(focusBlockId)) focusBlockId = forward ? blocks.at(-1)!.id : blocks[0]!.id;
      changed ||= blocks.length !== item.blocks.length
        || blocks.some((block, index) => block.id !== item.blocks[index]?.id
          || block.start !== item.blocks[index]?.start
          || block.end !== item.blocks[index]?.end)
        || anchorBlockId !== item.anchorBlockId || focusBlockId !== item.focusBlockId;
      changed ||= elements.length !== (item.elements?.length ?? 0);
      return { ...item, blocks, elements, anchorBlockId, focusBlockId };
    })();
    if (changed) {
      if (valid) this.selection.set(valid);
      else this.selection.clear();
    }
  }

  /**
   * Releases runtime-owned subscriptions and managers.
   *
   * Registered block definitions are removed in reverse order so callers see a
   * predictable teardown path even when definitions depend on earlier defaults.
   * The caller-owned document remains usable and must be released separately by its lifecycle owner.
   * @returns A Promise that resolves after runtime cleanup.
   */
  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    const errors: unknown[] = [];
    const run = (operation: () => void): void => {
      try {
        operation();
      } catch (error) {
        errors.push(error);
      }
    };
    this.unsubscribeFns.splice(0).forEach((unsubscribe) => run(unsubscribe));
    run(() => this.elements.destroy());
    run(() => this.blocks.destroy());
    run(() => this.blockListProps.destroy());
    run(() => this.blockRegistry.destroy());
    run(() => this.commands.clear());
    run(() => this.listeners.clear());
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "Editor teardown failed");
  }

  /**
   * Publishes one observable runtime change to subscribers.
   *
   * @returns No value.
   */
  private notifyChanges(): void {
    this.currentRevision += 1;
    this.listeners.emit("editorChanged");
  }


}

/**
 * Creates one editor runtime permanently bound to the document supplied by its lifecycle owner.
 *
 * @param options - Caller-owned document; registries and interaction state are local to the returned editor.
 * @returns Runtime whose lifecycle is owned by the caller.
 */
export function createRivtoEditor(options: CreateRivtoEditorOptions): EditorRuntime {
  return new EditorRuntime(options);
}

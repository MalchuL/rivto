/**
 * Editor runtime coordinating document mutations and focused public managers.
 */
import { BlockManager, BlockRegistryManager, ClipboardManager, CommandRegistry, ElementManager, type CommandHandler, type RegisteredCommand, ModeManager, SelectionManager, UndoManager } from "../managers";
import { YjsDoc } from "@chulane/crdt-doc";
import {
  DocumentModelImpl,
  createBlockParentConstraintProcessor,
  createBlockPropsProcessor,
  type Block,
  type DocumentModel,
  type Snapshot,
  type SnapshotUpdate,
} from "@chulane/document-model";
import type { ClipboardBundle } from "../managers/clipboard-manager";
import type { EditorSnapshot, EditorSnapshotUpdate } from "./model";
import { commandPayload } from "../managers/utils";
import type { CreateRivtoEditorOptions, RivtoEditorApi } from "./types";
import type { Selection } from "../managers/selection-manager";
import { Listeners } from "../utils";

/**
 * Coordinates editor lifecycle around focused public managers.
 *
 * Block APIs live exclusively on `.blocks`. The runtime
 * owns cross-cutting commands, selection, history, mode, subscriptions,
 * batching, clipboard bridges, and the shared revision stream.
 */
export class EditorRuntime implements RivtoEditorApi {
  /** Collaborative block, tree, and snapshot storage owned by this runtime. */
  readonly document: DocumentModel;
  /** Public owner of block commands and typed block operations. */
  readonly blocks: BlockManager;
  /** Public owner of native block definitions and property validation. */
  readonly blocksRegistry: BlockRegistryManager;
  /** Public owner of first-class canvas element commands. */
  readonly elements: ElementManager;
  /** Named command handlers exposed to integrations and typed runtime methods. */
  readonly commands = new CommandRegistry();
  /** Local presentation mode shared by views of this runtime. */
  readonly mode: ModeManager;
  /** Local text and structural selection state; never persisted to the document. */
  readonly selection: SelectionManager;
  /** Local Yjs undo/redo history for document changes made through this runtime. */
  readonly history: UndoManager;
  /** Framework-neutral structured and plain-text clipboard operations. */
  readonly clipboard: ClipboardManager;
  /** Named subscribers notified whenever public runtime state changes. */
  private readonly listeners = new Listeners<{ editorChanged: void }>();
  /** Owned subscription cleanup callbacks called during `destroy()`. */
  private readonly unsubscribeFns: Array<() => void> = [];
  /** Monotonic snapshot incremented before notifying runtime subscribers. */
  private currentRevision = 0;
  /** Zero outside a batch and positive while the outer transaction is active. */
  private batchDepth = 0;

  /**
   * Creates a runtime with a collaborative document, default blocks, and mode.
   *
   * @param options - Optional document adapter and startup mode.
   */
  constructor(options: CreateRivtoEditorOptions = {}) {
    this.document = new DocumentModelImpl(options.document ?? new YjsDoc(`rivto-${crypto.randomUUID()}`));
    this.mode = new ModeManager(options.mode ?? "block");
    this.selection = new SelectionManager(this);
    this.history = new UndoManager(this.document);
    this.blocksRegistry = new BlockRegistryManager();
    const unsubscribeFromBlockRegistryChanges = this.blocksRegistry.subscribe(() => this.notifyChanges());
    this.unsubscribeFns.push(unsubscribeFromBlockRegistryChanges);
    this.blocks = new BlockManager(this);
    this.elements = new ElementManager(this);
    this.clipboard = new ClipboardManager(this);
    this.unsubscribeFns.push(this.document.blocks.pipe.register(
      createBlockParentConstraintProcessor((childType, parentType) => {
        this.blocksRegistry.assertAllowedParent(childType, parentType);
      }),
    ));
    this.unsubscribeFns.push(this.document.blocks.pipe.register(
      createBlockPropsProcessor((type, props) => this.blocksRegistry.validate(type, props)),
    ));
    this.registerRuntimeCommands();
    this.registerClipboardCommands();

    // Keep the compatibility revision broad, but reserve expensive selection
    // reconciliation for mutations that can invalidate IDs or document order.
    const unsubscribeFromDocumentChanges = this.document.subscribe(() => this.notifyChanges());
    this.unsubscribeFns.push(unsubscribeFromDocumentChanges);
    this.unsubscribeFns.push(this.blocks.subscribeStructure(() => this.reconcileSelection()));
    this.unsubscribeFns.push(this.elements.subscribeMembership(() => this.reconcileSelection()));
    // Selection is local view state. React chrome subscribes through
    // `editor.selection`; folding it into `revision` would re-render every block.
    const unsubscribeFromModeChanges = this.mode.subscribe(() => {
      this.history.stopCapturing();
      this.reconcileSelection();
      this.notifyChanges();
      this.history.stopCapturing();
    });
    this.unsubscribeFns.push(unsubscribeFromModeChanges);
  }

  /**
   * Returns the current monotonic runtime revision.
   *
   * Document, mode, and block-definition changes increment this value before
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

  /**
   * Groups synchronous editor mutations into one collaborative update and undo step.
   *
   * The outermost call owns the CRDT transaction and history boundaries.
   * Nested calls reuse that active batch, so helpers can compose without
   * publishing intermediate document revisions or creating extra undo items.
   *
   * This is a batching boundary, not a rollback mechanism. Yjs retains writes
   * already made if `operation` throws; the original error is still propagated.
   *
   * @param operation - Synchronous editor work to execute inside the batch.
   * @returns The value returned by `operation`.
   * @throws The original error when `operation` fails.
   */
  batchUpdates<Result>(operation: () => Result): Result {
    if (this.batchDepth > 0) return operation();
    this.history.stopCapturing();
    this.batchDepth += 1;
    let result!: Result;
    try {
      this.document.transact(() => {
        result = operation();
      });
      return result;
    } finally {
      this.batchDepth -= 1;
      this.history.stopCapturing();
    }
  }

  /**
   * Registers one command on this runtime.
   *
   * @param name - Unique, non-empty command ID.
   * @param handler - Runtime command implementation.
   * @returns Ownership handle for this exact registration.
   */
  register(name: string, handler: CommandHandler): RegisteredCommand {
    return this.commands.register(name, handler);
  }

  /**
   * Executes a registered runtime command.
   *
   * @param name - Command ID to execute.
   * @param payload - Optional runtime payload passed to the handler.
   * @returns The command handler result.
   */
  execute(name: string, payload?: unknown): unknown {
    return this.commands.execute(name, payload);
  }

  /**
   * Removes a command from this runtime by name.
   *
   * @param name - Command ID to remove.
   * @returns No value.
   */
  removeCommand(name: string): void {
    this.commands.remove(name);
  }

  /**
   * Deletes the complete active selection as one undoable operation.
   *
   * Text boundaries are preserved according to SelectionManager normalization.
   * @returns No value.
   */
  deleteSelection(): void {
    this.execute("selection.delete");
  }

  /**
   * Replaces supplied document sections from a snapshot v6 update.
   *
   * Loading establishes a new history baseline, so earlier local changes
   * cannot be restored with undo.
   *
   * @param snapshot - Snapshot sections to validate and load.
   * @returns No value.
   */
  load(snapshot: EditorSnapshotUpdate): void {
    const command = { snapshot } satisfies { snapshot: SnapshotUpdate };
    this.execute("document.load", command);
  }

  /**
   * Materializes the complete portable document state.
   *
   * @returns Detached snapshot v6 suitable for persistence or transfer.
   */
  dump(): EditorSnapshot {
    const snapshot = this.document.getSnapshot() satisfies Snapshot;
    return snapshot satisfies EditorSnapshot;
  }

  /**
   * Reverts the latest captured local document operation.
   *
   * Remote collaborator updates are not part of this editor's undo history.
   * @returns No value.
   */
  undo(): void {
    this.execute("history.undo");
  }

  /**
   * Reapplies the latest locally undone document operation.
   * @returns No value.
   */
  redo(): void {
    this.execute("history.redo");
  }

  /**
   * Wraps one document command with the runtime's undo-capture boundary.
   *
   * Commands executed inside an explicit batch reuse the outer history scope.
   * Standalone commands stop capture before and after their mutation.
   *
   * @param handler - Command implementation that may mutate the document.
   * @returns Wrapped command handler preserving history boundaries.
   */
  private documentCommand(handler: CommandHandler): CommandHandler {
    return (value) => {
      const ownsHistoryBoundary = this.batchDepth === 0;
      if (ownsHistoryBoundary) this.history.stopCapturing();
      try {
        return handler(value);
      } finally {
        if (ownsHistoryBoundary) this.history.stopCapturing();
      }
    };
  }

  /**
   * Registers document-, selection-, and history-level runtime commands.
   *
   * Block command ownership belongs to the public block manager.
   *
   * @returns No value.
   */
  private registerRuntimeCommands(): void {
    this.commands.register("document.load", this.documentCommand((value) => {
      const data = commandPayload(value) as unknown as { snapshot: SnapshotUpdate };
      this.document.loadSnapshot(data.snapshot);
      this.history.clear();
    }));
    this.commands.register("selection.set", (value) => {
      const data = commandPayload(value) as unknown as {
        selection: Parameters<SelectionManager["set"]>[0];
      };
      this.selection.set(data.selection);
    });
    this.commands.register("selection.delete", () => this.selection.delete());
    this.commands.register("selection.clear", () => this.selection.clear());
    this.commands.register("history.undo", () => this.history.undo());
    this.commands.register("history.redo", () => this.history.redo());
  }

  /**
   * Registers data-only clipboard commands used by integrations and tests.
   *
   * ClipboardManager owns typed behavior; browser hosts own native events and
   * transfer the serialized string returned by copy and cut.
   * @returns No value.
   */
  private registerClipboardCommands(): void {
    type CopyPayload = { textTarget?: Selection };
    type PastePayload = {
      textTarget?: Selection;
      bundle?: ClipboardBundle;
      structured?: string;
      mergeText?: boolean;
      preserveNewlines?: boolean;
      defaultBlockType?: string;
      text?: string;
      placement?: { parentId: string | null; afterId: string | null; mergeText?: boolean; preserveNewlines?: boolean };
    };
    const payload = <Payload>(value: unknown): Partial<Payload> => value && typeof value === "object" && !Array.isArray(value)
      ? value as unknown as Partial<Payload>
      : {};
    const text = (value: unknown): string | undefined => typeof value === "string" ? value : undefined;
    this.commands.register("clipboard.copy", (value) => {
      const data = payload<CopyPayload>(value);
      const bundle = data.textTarget ? this.clipboard.copyText(data.textTarget) : this.clipboard.copy();
      return bundle ? JSON.stringify(bundle) : "";
    });

    this.commands.register("clipboard.cut", () => {
      const bundle = this.clipboard.cut();
      return bundle ? JSON.stringify(bundle) : "";
    });

    this.commands.register("clipboard.paste", (value) => {
      const data = payload<PastePayload>(value);
      const defaultBlockType = text(data.defaultBlockType);
      const structured = text(data.structured);
      const bundle = data.bundle;
      const hostPlacement = data.placement && typeof data.placement === "object"
        ? data.placement
        : {} as NonNullable<PastePayload["placement"]>;
      return this.clipboard.paste({
        textTarget: data.textTarget,
        bundle,
        structured,
        defaultBlockType,
        text: text(data.text),
        placement: {
          parentId: hostPlacement.parentId,
          afterId: hostPlacement.afterId,
          mergeText: data.mergeText ?? hostPlacement.mergeText,
          preserveNewlines: data.preserveNewlines ?? hostPlacement.preserveNewlines,
        },
      });
    });
  }

  /**
   * Reconciles local selection with the latest document.
   *
   * Direct document edits, remote CRDT updates, undo/redo, and mode swaps can
   * remove selected blocks. Deleted IDs are filtered, and block selections
   * are reordered to match the current tree.
   * When a block-selection endpoint disappeared, its replacement is chosen
   * from the same directional edge so top-down and bottom-up intent survives.
   * @returns No value.
   */
  private reconcileSelection(): void {
    const selection = this.selection.get();
    if (!selection) return;
    const visibleIds: string[] = [];
    const visit = (blocks: Block[]): void => blocks.forEach((block) => {
      visibleIds.push(block.id);
      visit(block.children);
    });
    visit(this.blocks.getBlocks());
    let changed = false;
    const valid = (() : Selection | undefined => {
      const item = selection;
      const selected = new Map(item.blocks.map((block) => [block.id, block]));
      const blocks = visibleIds.flatMap((id) => {
        const entry = selected.get(id);
        return entry ? [{ id: entry.id, start: entry.start, end: entry.end }] : [];
      });
      const elements = (item.elements ?? []).filter((id) => Boolean(this.elements.getElement(id)));
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
      const anchorBlockId = item.anchorBlockId && ids.has(item.anchorBlockId) ? item.anchorBlockId
        : forward ? blocks[0]!.id : blocks.at(-1)!.id;
      const focusBlockId = item.focusBlockId && ids.has(item.focusBlockId) ? item.focusBlockId
        : forward ? blocks.at(-1)!.id : blocks[0]!.id;
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
   * Releases subscriptions owned by the runtime, then destroys its CRDT document.
   *
   * Registered block definitions are removed in reverse order so callers see a
   * predictable teardown path even when definitions depend on earlier defaults.
   * @returns A Promise that resolves after providers and CRDT state are destroyed.
   */
  async destroy(): Promise<void> {
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
    run(() => this.blocksRegistry.destroy());
    run(() => this.history.destroy());
    run(() => this.commands.clear());
    run(() => this.listeners.clear());
    try {
      await this.document.crdt.destroy();
    } catch (error) {
      errors.push(error);
    }
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
 * Creates one editor runtime over an optional collaborative document.
 *
 * @param options - Optional document adapter and initial presentation mode.
 * @returns Runtime whose lifecycle is owned by the caller.
 */
export function createRivtoEditor(options: CreateRivtoEditorOptions = {}): EditorRuntime {
  return new EditorRuntime(options);
}

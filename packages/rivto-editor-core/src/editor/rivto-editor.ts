import { BlockManager, BlockRegistryManager, ClipboardManager, CommandRegistry, ElementManager, type CommandHandler, type RegisteredCommand, LinkManager, ModeManager, SelectionManager, UndoManager } from "../managers";
import { YjsDoc } from "../store/crdt-doc";
import { DocumentModelImpl, type Block, type DocumentModel, type Snapshot, type SnapshotUpdate } from "../store/document-model";
import {
  RIVTO_CLIPBOARD_MIME,
  type ClipboardBundle,
} from "../managers/clipboard-manager";
import type { EditorSnapshot, EditorSnapshotUpdate } from "./model";
import { commandPayload } from "../managers/utils";
import type { CreateRivtoEditorOptions, EditorSelectionItem, RivtoEditorApi } from "./types";
import { Listeners } from "../utils";

/** Framework-neutral subset of browser or host clipboard data. */
interface ClipboardDataLike {
  /**
   * Reads one MIME representation from the host clipboard.
   *
   * @param type - MIME type to retrieve.
   * @returns Stored clipboard text, or an empty string when unavailable.
   */
  getData(type: string): string;
  /**
   * Writes one MIME representation to the host clipboard.
   *
   * @param type - MIME type assigned to the value.
   * @param value - Serialized clipboard value to store.
   * @returns No value.
   */
  setData(type: string, value: string): void;
}

/** Structural clipboard event accepted without importing DOM event types. */
interface ClipboardEventLike {
  /** Host clipboard transfer, or null when clipboard access is unavailable. */
  readonly clipboardData: ClipboardDataLike | null;
  /**
   * Prevents the host's default clipboard behavior after Rivto handles the event.
   *
   * @returns No value.
   */
  preventDefault(): void;
}

/**
 * Coordinates editor lifecycle around focused public managers.
 *
 * Block and link APIs live exclusively on `.blocks` and `.links`. The runtime
 * owns cross-cutting commands, selection, history, mode, subscriptions,
 * batching, clipboard bridges, and the shared revision stream.
 */
export class EditorRuntime implements RivtoEditorApi {
  /** Collaborative block, tree, link, and snapshot storage owned by this runtime. */
  readonly document: DocumentModel;
  /** Public owner of block commands and typed block operations. */
  readonly blocks: BlockManager;
  /** Public owner of native block definitions and property validation. */
  readonly blocksRegistry: BlockRegistryManager;
  /** Public owner of link commands and typed link operations. */
  readonly links: LinkManager;
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
    this.links = new LinkManager(this);
    this.elements = new ElementManager(this);
    this.clipboard = new ClipboardManager(this);
    this.document.blocks.setPropsValidator((type, props) => this.blocksRegistry.validate(type, props));
    this.registerRuntimeCommands();
    this.registerClipboardCommands();

    // Document changes cover block commands and direct/remote document edits.
    // !!!We subscribe to document changes to get updates and reconcile the selection with the latest document.
    const unsubscribeFromDocumentChanges = this.document.subscribe(() => {
      this.reconcileSelection();
      this.notifyChanges();
    });
    this.unsubscribeFns.push(unsubscribeFromDocumentChanges);
    // Selection is local view state, but renderers still need to redraw selected blocks.
    const unsubscribeFromSelectionChanges = this.selection.subscribe(() => this.notifyChanges());
    this.unsubscribeFns.push(unsubscribeFromSelectionChanges);
    // Mode changes are local runtime state, so they still notify directly.
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
   * Document, selection, mode, and block-definition changes increment this
   * value before runtime subscribers are notified.
   *
   * @returns Current editor revision.
   */
  get revision(): number { return this.currentRevision; }

  /**
   * Subscribes to runtime revision changes.
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
   * Replaces supplied document sections from a snapshot v5 update.
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
   * @returns Detached snapshot v5 suitable for persistence or transfer.
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
   * Block and link command ownership belongs to their public managers.
   *
   * @returns No value.
   */
  private registerRuntimeCommands(): void {
    this.commands.register("document.load", this.documentCommand((value) => {
      const data = commandPayload(value);
      this.document.loadSnapshot(data.snapshot as SnapshotUpdate);
      this.history.clear();
    }));
    this.commands.register("selection.set", (value) => {
      const data = commandPayload(value);
      this.selection.set(data.selection as Parameters<SelectionManager["set"]>[0]);
    });
    this.commands.register("selection.delete", () => this.selection.delete());
    this.commands.register("selection.clear", () => this.selection.clear());
    this.commands.register("history.undo", () => this.history.undo());
    this.commands.register("history.redo", () => this.history.redo());
  }

  /**
   * Registers clipboard commands used by view bridges and tests.
   *
   * ClipboardManager owns typed behavior. These handlers only preserve the
   * existing string-command payloads used by integrations and older tests.
   * @returns No value.
   */
  private registerClipboardCommands(): void {
    type Payload = Record<string, unknown>;
    const payload = (value: unknown): Payload => value && typeof value === "object" && !Array.isArray(value) ? value as Payload : {};
    const text = (value: unknown): string | undefined => typeof value === "string" ? value : undefined;
    const clipboardEvent = (value: unknown): ClipboardEventLike | undefined => {
      const candidate = payload(value).event ?? value;
      return candidate && typeof candidate === "object" && "clipboardData" in candidate && "preventDefault" in candidate
        ? candidate as ClipboardEventLike
        : undefined;
    };
    this.commands.register("clipboard.copy", (value) => {
      const event = clipboardEvent(value);
      const data = payload(value);
      const payloadData = this.clipboard.copy();
      if (!payloadData) return "";
      if (event?.clipboardData) {
        event.preventDefault();
        event.clipboardData.setData(RIVTO_CLIPBOARD_MIME, JSON.stringify(payloadData.bundle));
        event.clipboardData.setData("text/html", payloadData.html);
        event.clipboardData.setData("text/markdown", payloadData.markdown);
        event.clipboardData.setData("text/plain", payloadData.text);
      }
      if (data.clipboardData && typeof (data.clipboardData as { setData?: unknown }).setData === "function") {
        const transfer = data.clipboardData as Pick<ClipboardDataLike, "setData">;
        transfer.setData(RIVTO_CLIPBOARD_MIME, JSON.stringify(payloadData.bundle));
        transfer.setData("text/html", payloadData.html);
        transfer.setData("text/markdown", payloadData.markdown);
        transfer.setData("text/plain", payloadData.text);
      }
      return payloadData.text;
    });

    this.commands.register("clipboard.cut", (value) => {
      const event = clipboardEvent(value);
      const payloadData = this.clipboard.cut();
      if (!payloadData) return "";
      if (event?.clipboardData) {
        event.preventDefault();
        event.clipboardData.setData(RIVTO_CLIPBOARD_MIME, JSON.stringify(payloadData.bundle));
        event.clipboardData.setData("text/html", payloadData.html);
        event.clipboardData.setData("text/markdown", payloadData.markdown);
        event.clipboardData.setData("text/plain", payloadData.text);
      }
      return payloadData.text;
    });

    this.commands.register("clipboard.paste", (value) => {
      const event = clipboardEvent(value);
      const data = payload(value);
      const defaultBlockType = text(data.defaultBlockType);
      const structured = text(data.structured)
        ?? (event?.clipboardData?.getData(RIVTO_CLIPBOARD_MIME) || undefined);
      const bundle = data.bundle as ClipboardBundle | undefined;
      const mergeText = data.mergeText !== false;
      const preserveNewlines = data.preserveNewlines === true;
      const explicitText = text(data.text);
      if (event?.clipboardData) event.preventDefault();
      this.clipboard.paste({
        bundle,
        structured,
        mergeText,
        preserveNewlines,
        defaultBlockType,
        text: explicitText ?? event?.clipboardData?.getData("text/plain"),
      });
    });
  }

  /**
   * Reconciles local selection with the latest document.
   *
   * Direct document edits, remote CRDT updates, undo/redo, and mode swaps can
   * remove selected blocks or shorten selected text. Surviving text offsets are
   * clamped, deleted structural IDs are
   * filtered, and block selections are reordered to match the current tree.
   * When a block-selection endpoint disappeared, its replacement is chosen
   * from the same directional edge so top-down and bottom-up intent survives.
   * @returns No value.
   */
  private reconcileSelection(): void {
    const selection = this.selection.get();
    const visibleIds: string[] = [];
    const visit = (blocks: Block[]): void => blocks.forEach((block) => {
      visibleIds.push(block.id);
      visit(block.children);
    });
    visit(this.blocks.getBlocks());
    const order = new Map(visibleIds.map((id, index) => [id, index]));
    let changed = false;
    const valid = selection.flatMap((item): EditorSelectionItem[] => {
      if (item.type === "text") {
        const anchorBlock = this.blocks.getBlock(item.anchor.blockId);
        const headBlock = this.blocks.getBlock(item.head.blockId);
        if (!anchorBlock || !headBlock) {
          changed = true;
          return [];
        }
        const anchorOffset = Math.min(item.anchor.offset, anchorBlock.content.length);
        const headOffset = Math.min(item.head.offset, headBlock.content.length);
        if (anchorOffset === item.anchor.offset && headOffset === item.head.offset) return [item];
        changed = true;
        return [{
          ...item,
          anchor: { ...item.anchor, offset: anchorOffset },
          head: { ...item.head, offset: headOffset },
        }];
      }

      const selected = new Set(item.blockIds);
      const blockIds = visibleIds.filter((id) => selected.has(id));
      if (!blockIds.length) {
        changed = true;
        return [];
      }
      const anchorIndex = item.blockIds.indexOf(item.anchorBlockId);
      const focusIndex = item.blockIds.indexOf(item.focusBlockId);
      const forward = anchorIndex <= focusIndex;
      const anchorBlockId = selected.has(item.anchorBlockId) && order.has(item.anchorBlockId)
        ? item.anchorBlockId
        : forward ? blockIds[0]! : blockIds.at(-1)!;
      const focusBlockId = selected.has(item.focusBlockId) && order.has(item.focusBlockId)
        ? item.focusBlockId
        : forward ? blockIds.at(-1)! : blockIds[0]!;
      if (
        blockIds.length !== item.blockIds.length ||
        blockIds.some((id, index) => id !== item.blockIds[index]) ||
        anchorBlockId !== item.anchorBlockId ||
        focusBlockId !== item.focusBlockId
      ) changed = true;
      return [{ ...item, blockIds, anchorBlockId, focusBlockId }];
    });
    if (changed) this.selection.set(valid);
  }

  /**
   * Releases subscriptions owned by the runtime.
   *
   * Registered block definitions are removed in reverse order so callers see a
   * predictable teardown path even when definitions depend on earlier defaults.
   * @returns No value.
   */
  destroy(): void {
    this.unsubscribeFns.splice(0).forEach((unsubscribe) => unsubscribe());
    this.links.destroy();
    this.elements.destroy();
    this.blocks.destroy();
    this.blocksRegistry.destroy();
    this.history.destroy();
    this.commands.clear();
    this.listeners.clear();
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

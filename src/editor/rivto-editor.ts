import { BlockRegistry, defaultBlockDefinitions, type BlockDefinition } from "../blocks";
import { CommandRegistry, type CommandHandler, type RegisteredCommand, ModeManager, SelectionManager, UndoManager } from "../managers";
import { YjsDoc } from "../store/crdt-doc";
import { DocumentModelImpl, type Block, type BlockInput, type BlockLayout, type BlockPatch, type Link, type Snapshot, type SnapshotUpdate } from "../store/document-model";
import type { EditorBlock, EditorBlockInput, EditorBlockLayout, EditorBlockPatch, EditorLink, EditorSnapshot, EditorSnapshotUpdate } from "./model";
import type { CreateRivtoEditorOptions, EditorPosition, EditorSelection, RivtoEditorApi } from "./types";

type RuntimeBlockSelection = Extract<EditorSelection, { type: "block" }>;

/**
 * Owns the active document, block registry, commands, and editor mode.
 *
 * The runtime currently registers document mutation commands. It connects
 * document, block definition, and mode changes to a single revision stream
 * that any view layer can subscribe to.
 */
export class EditorRuntime implements RivtoEditorApi {
  readonly document: DocumentModelImpl;
  readonly blocks = new BlockRegistry();
  readonly commands = new CommandRegistry();
  readonly mode: ModeManager;
  readonly selection = new SelectionManager();
  readonly history: UndoManager;
  private readonly listeners = new Set<() => void>();
  /** Unsubscribe callbacks owned by the runtime and called during destroy(). */
  private readonly unsubscribeFns: Array<() => void> = [];
  private readonly removeDefinitions = new Set<() => void>();
  private currentRevision = 0;

  /**
   * Creates a runtime with a collaborative document, default blocks, and mode.
   *
   * @param options - Optional document adapter and startup mode.
   */
  constructor(options: CreateRivtoEditorOptions = {}) {
    this.document = new DocumentModelImpl(options.document ?? new YjsDoc(`rivto-${crypto.randomUUID()}`));
    this.mode = new ModeManager(options.mode ?? "block");
    this.history = new UndoManager(this.document);
    this.document.setPropsValidator((type, props) => this.blocks.validate(type, props));
    this.registerBlockCommands();
    defaultBlockDefinitions.forEach((definition) => this.defineBlock(definition));

    // Document changes cover block commands and direct/remote document edits.
    const unsubscribeFromDocumentChanges = this.document.subscribe(() => {
      this.reconcileSelection();
      this.changed();
    });
    this.unsubscribeFns.push(unsubscribeFromDocumentChanges);
    // Selection is local view state, but renderers still need to redraw selected blocks.
    const unsubscribeFromSelectionChanges = this.selection.subscribe(() => this.changed());
    this.unsubscribeFns.push(unsubscribeFromSelectionChanges);
    // Mode changes are local runtime state, so they still notify directly.
    const unsubscribeFromModeChanges = this.mode.subscribe(() => {
      this.reconcileSelection();
      this.changed();
    });
    this.unsubscribeFns.push(unsubscribeFromModeChanges);
  }

  /** Current runtime revision, incremented after every observable change. */
  get revision(): number { return this.currentRevision; }

  /**
   * Subscribes to runtime revision changes.
   *
   * @param listener - Callback called after an observable runtime change.
   * @returns Function that removes this listener.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
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
   */
  removeCommand(name: string): void {
    this.commands.remove(name);
  }

  /** Finds one block in the current detached document tree. */
  getBlock(id: string): EditorBlock | undefined {
    const find = (blocks: EditorBlock[]): EditorBlock | undefined => {
      for (const block of blocks) {
        if (block.id === id) return block;
        const child = find(block.children);
        if (child) return child;
      }
      return undefined;
    };
    return find(this.getBlocks());
  }

  /** Returns current root blocks as detached values. */
  getBlocks(): EditorBlock[] {
    return this.document.document satisfies EditorBlock[];
  }

  /** Finds one link by ID. */
  getLink(id: string): EditorLink | undefined {
    return this.getLinks().find((link) => link.id === id);
  }

  /** Returns all current document links as detached values. */
  getLinks(): EditorLink[] {
    return this.document.links satisfies EditorLink[];
  }

  /** Inserts a block through the built-in command path. */
  insertBlock(block: EditorBlockInput, afterId?: string | null): string {
    const command = { block, afterId } satisfies { block: BlockInput; afterId?: string | null };
    return this.execute("block.insert", command) as string;
  }

  /** Updates mutable block fields through the built-in command path. */
  updateBlock(id: string, patch: EditorBlockPatch): void {
    const command = { id, patch } satisfies { id: string; patch: BlockPatch };
    this.execute("block.update", command);
  }

  /** Removes a block through the built-in command path. */
  removeBlock(id: string): void {
    this.execute("block.remove", { id });
  }

  /** Moves a block through the built-in command path. */
  moveBlock(id: string, afterId: string | null): void {
    this.execute("block.move", { id, afterId });
  }

  /** Indents a block through the built-in command path. */
  indentBlock(id: string): void {
    this.execute("block.indent", { id });
  }

  /** Outdents a block through the built-in command path. */
  outdentBlock(id: string): void {
    this.execute("block.outdent", { id });
  }

  /** Sets one block property through the built-in command path. */
  setBlockProp(id: string, key: string, value: unknown): void {
    this.execute("block.prop.set", { id, key, value });
  }

  /** Sets one plugin-data namespace through the built-in command path. */
  setBlockPluginData(id: string, pluginId: string, value: unknown): void {
    this.execute("block.pluginData.set", { id, pluginId, value });
  }

  /** Patches block layout through the built-in command path. */
  setBlockLayout(id: string, layout: Partial<EditorBlockLayout>): void {
    const command = { id, layout } satisfies { id: string; layout: Partial<BlockLayout> };
    this.execute("block.layout.set", command);
  }

  /** Creates or replaces a link through the built-in command path. */
  createLink(link: EditorLink): void {
    const command = { link } satisfies { link: Link };
    this.execute("link.create", command);
  }

  /** Removes a link through the built-in command path. */
  removeLink(id: string): void {
    this.execute("link.remove", { id });
  }

  /** Loads persisted document state through the built-in command path. */
  load(snapshot: EditorSnapshotUpdate): void {
    const command = { snapshot } satisfies { snapshot: SnapshotUpdate };
    this.execute("document.load", command);
  }

  /** Dumps the current document snapshot for persistence. */
  dump(): EditorSnapshot {
    const snapshot = this.document.getSnapshot() satisfies Snapshot;
    return snapshot satisfies EditorSnapshot;
  }

  /** Reverts the latest local document operation through the built-in command path. */
  undo(): void {
    this.execute("history.undo");
  }

  /** Reapplies the latest undone document operation through the built-in command path. */
  redo(): void {
    this.execute("history.redo");
  }

  /**
   * Registers one block definition for this editor instance.
   *
   * @param definition - Definition for a unique, non-empty native type.
   * @returns Idempotent function that unregisters this definition and updates subscribers.
   */
  defineBlock(definition: BlockDefinition): () => void {
    const unregister = this.blocks.register(definition);
    let active = true;
    const dispose = () => {
      if (!active) return;
      active = false;
      unregister();
      this.removeDefinitions.delete(dispose);
      this.changed();
    };
    this.removeDefinitions.add(dispose);
    this.changed();
    return dispose;
  }

  /**
   * Registers built-in commands that mutate document data.
   *
   * Commands validate their small runtime payloads, then delegate storage and
   * CRDT behavior to DocumentModelImpl.
   */
  private registerBlockCommands(): void {
    type Payload = Record<string, unknown>;
    const payload = (value: unknown): Payload => {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Command payload must be an object");
      return value as Payload;
    };
    const string = (value: unknown, name: string): string => {
      if (typeof value !== "string") throw new Error(`${name} must be a string`);
      return value;
    };
    const documentCommand = (handler: (value?: unknown) => unknown): CommandHandler => (value) => {
      this.history.stopCapturing();
      try {
        return handler(value);
      } finally {
        this.history.stopCapturing();
      }
    };

    this.commands.register("block.insert", documentCommand((value) => {
      const data = payload(value);
      const block = payload(data.block) as unknown as BlockInput;
      if (typeof block.type !== "string") throw new Error("block.type must be a string");
      const definition = this.blocks.get(block.type);
      if (!definition) throw new Error(`Block type ${block.type} is unavailable in ${this.mode.get()} mode`);
      const afterId = data.afterId === undefined ? undefined : data.afterId === null ? null : string(data.afterId, "afterId");
      return this.document.insertBlock(this.blocks.prepare(block), afterId);
    }));
    this.commands.register("block.update", (value) => {
      const data = payload(value);
      this.document.updateBlock(string(data.id, "id"), payload(data.patch) as BlockPatch);
    });
    this.commands.register("block.remove", documentCommand((value) => {
      const data = payload(value);
      this.document.transact(() => {
        this.selectedBlockIds(string(data.id, "id")).forEach((id) => this.document.removeBlock(id));
      });
    }));
    this.commands.register("block.move", documentCommand((value) => {
      const data = payload(value);
      this.document.moveBlock(string(data.id, "id"), data.afterId === null ? null : string(data.afterId, "afterId"));
    }));
    this.commands.register("block.indent", documentCommand((value) => {
      const data = payload(value);
      const before = this.selection.get();
      const ids = this.selectedBlockIds(string(data.id, "id"));
      this.document.transact(() => ids.forEach((id) => this.document.indentBlock(id)));
      this.restoreBlockSelection(before, ids);
    }));
    this.commands.register("block.outdent", documentCommand((value) => {
      const data = payload(value);
      const before = this.selection.get();
      const ids = this.selectedBlockIds(string(data.id, "id"));
      this.document.transact(() => {
        [...ids].reverse().forEach((id) => this.document.outdentBlock(id));
      });
      this.restoreBlockSelection(before, ids);
    }));
    this.commands.register("block.prop.set", documentCommand((value) => {
      const data = payload(value);
      this.document.setBlockProp(string(data.id, "id"), string(data.key, "key"), data.value);
    }));
    this.commands.register("block.pluginData.set", documentCommand((value) => {
      const data = payload(value);
      this.document.setPluginData(string(data.id, "id"), string(data.pluginId, "pluginId"), data.value);
    }));
    this.commands.register("block.layout.set", documentCommand((value) => {
      const data = payload(value);
      this.document.setBlockLayout(string(data.id, "id"), payload(data.layout) as Partial<BlockLayout>);
    }));
    this.commands.register("link.create", documentCommand((value) => {
      const data = payload(value);
      this.document.createLink(payload(data.link) as unknown as Link);
    }));
    this.commands.register("link.remove", documentCommand((value) => {
      const data = payload(value);
      this.document.removeLink(string(data.id, "id"));
    }));
    this.commands.register("document.load", documentCommand((value) => {
      const data = payload(value);
      this.document.loadSnapshot(data.snapshot as SnapshotUpdate);
      this.history.clear();
    }));
    this.commands.register("selection.set", (value) => {
      const data = payload(value);
      this.setSelection(data.selection as EditorSelection);
    });
    this.commands.register("selection.clear", () => this.selection.clear());
    this.commands.register("history.undo", () => this.history.undo());
    this.commands.register("history.redo", () => this.history.redo());
  }

  /**
   * Expands a block command to the active block selection when the target block
   * belongs to that selection.
   */
  private selectedBlockIds(id: string): string[] {
    const selection = this.selection.get();
    return selection?.type === "block" && selection.blockIds.includes(id) ? selection.blockIds : [id];
  }

  /** Re-publishes block selection after structural moves reorder the document tree. */
  private restoreBlockSelection(previous: EditorSelection | null, ids: string[]): void {
    if (previous?.type !== "block") return;
    const remaining = ids.filter((id) => this.findBlock(id));
    if (!remaining.length) {
      this.selection.clear();
      return;
    }
    const anchorBlockId = remaining.includes(previous.anchorBlockId) ? previous.anchorBlockId : remaining[0]!;
    const focusBlockId = remaining.includes(previous.focusBlockId) ? previous.focusBlockId : remaining.at(-1)!;
    this.setSelection({ type: "block", blockIds: remaining, anchorBlockId, focusBlockId } satisfies RuntimeBlockSelection);
  }

  /**
   * Validates and stores a local selection.
   *
   * Text offsets are checked against current block content. Block selections are
   * stored in visible document order while preserving anchor/focus direction.
   * Edgeless selection is only valid while the editor is in edgeless mode.
   */
  private setSelection(selection: EditorSelection): void {
    if (!selection || !["text", "block", "edgeless"].includes(selection.type)) throw new Error("Invalid selection");
    if (selection.type === "text") {
      this.validatePosition(selection.anchor);
      this.validatePosition(selection.head);
      this.selection.set(selection);
      return;
    }

    if (!selection.blockIds.length) throw new Error("Selection requires at least one block");
    selection.blockIds.forEach((id) => {
      if (!this.findBlock(id)) throw new Error(`Selection block ${id} not found`);
    });
    if (selection.type === "edgeless") {
      if (this.mode.get() !== "edgeless") throw new Error("Edgeless selection requires edgeless mode");
      this.selection.set(selection);
      return;
    }
    if (!selection.blockIds.includes(selection.anchorBlockId) || !selection.blockIds.includes(selection.focusBlockId)) {
      throw new Error("Block selection endpoints must be selected");
    }

    const selected = new Set(selection.blockIds);
    const ordered: string[] = [];
    const visit = (blocks: Block[]): void => blocks.forEach((block) => {
      if (selected.has(block.id)) ordered.push(block.id);
      visit(block.children);
    });
    visit(this.document.document);
    this.selection.set({ ...selection, blockIds: ordered });
  }

  /**
   * Clears selections made invalid by document or mode changes.
   *
   * Direct document edits, remote CRDT updates, undo/redo, and mode swaps can
   * remove selected blocks or make edgeless selections illegal.
   */
  private reconcileSelection(): void {
    const selection = this.selection.get();
    if (!selection) return;
    const ids = selection.type === "text" ? [selection.anchor.blockId, selection.head.blockId] : selection.blockIds;
    if (ids.some((id) => !this.findBlock(id)) || (selection.type === "edgeless" && this.mode.get() !== "edgeless")) {
      this.selection.clear();
    }
  }

  /** Finds one block recursively in detached document values. */
  private findBlock(id: string, blocks: Block[] = this.document.document): Block | undefined {
    for (const block of blocks) {
      if (block.id === id) return block;
      const child = this.findBlock(id, block.children);
      if (child) return child;
    }
    return undefined;
  }

  /** Validates a UTF-16 text position against current document content. */
  private validatePosition(position: EditorPosition): void {
    const block = this.findBlock(position.blockId);
    if (!block) throw new Error(`Selection block ${position.blockId} not found`);
    if (!Number.isInteger(position.offset) || position.offset < 0 || position.offset > block.content.length) {
      throw new Error(`Selection offset ${position.offset} is outside block ${position.blockId}`);
    }
  }

  /**
   * Releases subscriptions owned by the runtime.
   *
   * Registered block definitions are removed in reverse order so callers see a
   * predictable teardown path even when definitions depend on earlier defaults.
   */
  destroy(): void {
    this.unsubscribeFns.splice(0).forEach((unsubscribe) => unsubscribe());
    [...this.removeDefinitions].reverse().forEach((dispose) => dispose());
    this.history.destroy();
    this.commands.clear();
    this.listeners.clear();
  }

  /** Publishes one observable runtime change to subscribers. */
  private changed(): void {
    this.currentRevision += 1;
    this.listeners.forEach((listener) => listener());
  }
}

export function createRivtoEditor(options: CreateRivtoEditorOptions = {}): EditorRuntime {
  return new EditorRuntime(options);
}

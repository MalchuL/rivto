import {
  BLOCK_COLLAPSED_PROP,
  BlockRegistry,
  defaultBlockDefinitions,
  type BlockDefinition,
} from "../blocks";
import { CommandRegistry, type CommandHandler, type RegisteredCommand, ModeManager, SelectionManager, UndoManager } from "../managers";
import { YjsDoc } from "../store/crdt-doc";
import { DocumentModelImpl, type Block, type BlockInput, type BlockLayout, type BlockPatch, type Link, type Snapshot, type SnapshotUpdate } from "../store/document-model";
import { isBlockCollapsed } from "../utils";
import {
  createClipboardPayload,
  cutSelection,
  deleteSelection,
  htmlToText,
  normalizeSelection,
  pasteClipboardBundle,
  pastePlainText,
  RIVTO_CLIPBOARD_MIME,
  type ClipboardBundle,
} from "./clipboard";
import type { EditorBlock, EditorBlockInput, EditorBlockLayout, EditorBlockPatch, EditorLink, EditorSnapshot, EditorSnapshotUpdate } from "./model";
import type { CreateRivtoEditorOptions, EditorPosition, EditorSelection, EditorSelectionItem, RivtoEditorApi } from "./types";

type RuntimeBlockSelection = Extract<EditorSelectionItem, { type: "block" }>;

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
    this.registerClipboardCommands();
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
      this.history.stopCapturing();
      this.reconcileSelection();
      this.changed();
      this.history.stopCapturing();
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

  /** Reads the latest collapse value without exposing native property access. */
  getBlockCollapsed(id: string): boolean {
    const block = this.getBlock(id);
    return block ? isBlockCollapsed(block) : false;
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

  /** Converts a block to another registered native type. */
  setBlockType(id: string, type: string): void {
    this.execute("block.type.set", { id, type });
  }

  /** Removes a block through the built-in command path. */
  removeBlock(id: string): void {
    this.execute("block.remove", { id });
  }

  /** Deletes every active selection item through one document command. */
  deleteSelection(): void {
    this.execute("selection.delete");
  }

  /** Atomically merges a source block into a target through the built-in command path. */
  mergeBlocks(targetId: string, sourceId: string): number {
    return this.execute("block.merge", { targetId, sourceId }) as number;
  }

  /** Moves a block before, after, or inside a target through the built-in command path. */
  moveBlock(id: string, targetId: string | null, position: "before" | "after" | "inside" = "after"): void {
    this.execute("block.move", { id, targetId, position });
  }

  /** Moves sibling block roots through one built-in command and undo item. */
  moveBlocks(ids: string[], targetId: string | null, position: "before" | "after" | "inside" = "after"): void {
    this.execute("block.move-many", { ids, targetId, position });
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

  /** Persists one block's collapse state through the shared batch command. */
  setBlockCollapsed(id: string, collapsed: boolean): void {
    this.setBlocksCollapsed(id, collapsed);
  }

  /** Persists one collapse state for one or several blocks in one undoable command. */
  setBlocksCollapsed(ids: string | string[], collapsed: boolean): void {
    this.execute("block.collapsed.set", { ids: typeof ids === "string" ? [ids] : ids, collapsed });
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
    this.commands.register("block.type.set", documentCommand((value) => {
      const data = payload(value);
      const id = string(data.id, "id");
      const type = string(data.type, "type");
      const current = this.getBlock(id);
      const prepared = this.blocks.prepare({
        type,
        props: current && BLOCK_COLLAPSED_PROP in current.props
          ? { [BLOCK_COLLAPSED_PROP]: current.props[BLOCK_COLLAPSED_PROP] }
          : undefined,
      });
      this.document.setBlockType(id, type, prepared.props);
    }));
    this.commands.register("block.remove", documentCommand((value) => {
      const data = payload(value);
      this.document.transact(() => {
        this.selectedBlockIds(string(data.id, "id")).forEach((id) => this.document.removeBlock(id));
      });
    }));
    this.commands.register("block.merge", documentCommand((value) => {
      const data = payload(value);
      return this.document.mergeBlocks(
        string(data.targetId, "targetId"),
        string(data.sourceId, "sourceId"),
      );
    }));
    this.commands.register("block.move", documentCommand((value) => {
      const data = payload(value);
      // `afterId` remains readable for snapshots created during the top-down
      // rewrite; new callers use the placement-neutral targetId field.
      const rawTarget = "targetId" in data ? data.targetId : data.afterId;
      this.document.moveBlock(
        string(data.id, "id"),
        rawTarget === null ? null : string(rawTarget, "targetId"),
        data.position === "before" || data.position === "inside" ? data.position : "after",
      );
    }));
    this.commands.register("block.move-many", documentCommand((value) => {
      const data = payload(value);
      if (!Array.isArray(data.ids) || data.ids.some((id) => typeof id !== "string")) {
        throw new Error("ids must be an array of strings");
      }
      const targetId = data.targetId === null ? null : string(data.targetId, "targetId");
      const position = data.position === "before" || data.position === "inside" ? data.position : "after";
      this.document.moveBlocks(data.ids, targetId, position);
    }));
    this.commands.register("block.indent", documentCommand((value) => {
      const data = payload(value);
      const before = this.selection.get();
      const ids = this.selectedStructuralBlockIds(string(data.id, "id"));
      this.document.indentBlocks(ids);
      this.restoreBlockSelection(before, ids);
    }));
    this.commands.register("block.outdent", documentCommand((value) => {
      const data = payload(value);
      const before = this.selection.get();
      const ids = this.selectedStructuralBlockIds(string(data.id, "id"));
      this.document.outdentBlocks(ids);
      this.restoreBlockSelection(before, ids);
    }));
    this.commands.register("block.prop.set", documentCommand((value) => {
      const data = payload(value);
      this.document.setBlockProp(string(data.id, "id"), string(data.key, "key"), data.value);
    }));
    this.commands.register("block.collapsed.set", documentCommand((value) => {
      const data = payload(value);
      if (!Array.isArray(data.ids) || data.ids.some((id) => typeof id !== "string")) {
        throw new Error("ids must be an array of strings");
      }
      if (typeof data.collapsed !== "boolean") throw new Error("collapsed must be a boolean");
      const blocks = [...new Set(data.ids)].map((id) => {
        const block = this.getBlock(id);
        if (!block) throw new Error(`Block ${id} not found`);
        return block;
      });
      this.document.transact(() => {
        blocks.forEach((block) => {
          if (data.collapsed && block.children.length === 0) return;
          if (isBlockCollapsed(block) === data.collapsed) return;
          this.document.setBlockProp(block.id, BLOCK_COLLAPSED_PROP, data.collapsed);
        });
      });
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
    this.commands.register("selection.delete", documentCommand(() => {
      deleteSelection(this.document, this.selection, this.selection.get());
    }));
    this.commands.register("selection.clear", () => this.selection.clear());
    this.commands.register("history.undo", () => this.history.undo());
    this.commands.register("history.redo", () => this.history.redo());
  }

  /**
   * Registers clipboard commands used by React DOM bridges and tests.
   *
   * The runtime keeps this as commands rather than a manager because clipboard
   * behavior is just document mutation plus local selection updates. Browser
   * event details are read here only to synchronously set custom MIME data.
   */
  private registerClipboardCommands(): void {
    type Payload = Record<string, unknown>;
    const payload = (value: unknown): Payload => value && typeof value === "object" && !Array.isArray(value) ? value as Payload : {};
    const text = (value: unknown): string | undefined => typeof value === "string" ? value : undefined;
    const clipboardEvent = (value: unknown): ClipboardEvent | undefined => {
      const candidate = payload(value).event ?? value;
      return candidate && typeof candidate === "object" && "clipboardData" in candidate && "preventDefault" in candidate
        ? candidate as ClipboardEvent
        : undefined;
    };
    const documentCommand = (handler: (value?: unknown) => unknown): CommandHandler => (value) => {
      this.history.stopCapturing();
      try {
        return handler(value);
      } finally {
        this.history.stopCapturing();
      }
    };

    this.commands.register("clipboard.copy", (value) => {
      const event = clipboardEvent(value);
      const data = payload(value);
      const payloadData = createClipboardPayload(this.document, this.selection.get());
      if (!payloadData) return "";
      if (event?.clipboardData) {
        event.preventDefault();
        event.clipboardData.setData(RIVTO_CLIPBOARD_MIME, JSON.stringify(payloadData.bundle));
        event.clipboardData.setData("text/html", payloadData.html);
        event.clipboardData.setData("text/plain", payloadData.text);
      }
      if (data.clipboardData && typeof (data.clipboardData as { setData?: unknown }).setData === "function") {
        const transfer = data.clipboardData as Pick<DataTransfer, "setData">;
        transfer.setData(RIVTO_CLIPBOARD_MIME, JSON.stringify(payloadData.bundle));
        transfer.setData("text/html", payloadData.html);
        transfer.setData("text/plain", payloadData.text);
      }
      return payloadData.text;
    });

    this.commands.register("clipboard.cut", documentCommand((value) => {
      const event = clipboardEvent(value);
      const payloadData = cutSelection(this.document, this.selection, this.selection.get());
      if (!payloadData) return "";
      if (event?.clipboardData) {
        event.preventDefault();
        event.clipboardData.setData(RIVTO_CLIPBOARD_MIME, JSON.stringify(payloadData.bundle));
        event.clipboardData.setData("text/html", payloadData.html);
        event.clipboardData.setData("text/plain", payloadData.text);
      }
      return payloadData.text;
    }));

    this.commands.register("clipboard.paste", documentCommand((value) => {
      const event = clipboardEvent(value);
      const data = payload(value);
      const defaultBlockType = text(data.defaultBlockType) ?? "paragraph";
      const structured = text(data.structured)
        ?? (event?.clipboardData?.getData(RIVTO_CLIPBOARD_MIME) || undefined);
      const bundle = data.bundle as ClipboardBundle | undefined;
      const mergeText = data.mergeText !== false;
      if (event?.clipboardData) event.preventDefault();
      if (bundle) {
        pasteClipboardBundle(this.document, this.selection, this.selection.get(), bundle, mergeText);
        return;
      }
      if (structured) {
        pasteClipboardBundle(
          this.document,
          this.selection,
          this.selection.get(),
          JSON.parse(structured) as ClipboardBundle,
          mergeText,
        );
        return;
      }
      const plain = text(data.text)
        ?? (event?.clipboardData?.getData("text/html") ? htmlToText(event.clipboardData.getData("text/html")) : undefined)
        ?? event?.clipboardData?.getData("text/plain")
        ?? "";
      pastePlainText(this.document, this.selection, this.selection.get(), defaultBlockType, plain);
    }));
  }

  /**
   * Expands a block command to the active block selection when the target block
   * belongs to that selection.
   */
  private selectedBlockIds(id: string): string[] {
    const selection = this.selection.get().find((item) => item.type === "block" && item.blockIds.includes(id));
    return selection?.type === "block" ? selection.blockIds : [id];
  }

  /** Resolves a structural command target to the complete active selection range. */
  private selectedStructuralBlockIds(id: string): string[] {
    const range = normalizeSelection(this.document, this.selection.get());
    return range?.blocks.some((block) => block.id === id)
      ? range.blocks.map((block) => block.id)
      : [id];
  }

  /** Re-publishes block selection after structural moves reorder the document tree. */
  private restoreBlockSelection(previous: EditorSelection, ids: string[]): void {
    const index = previous.findIndex((item) => item.type === "block" && ids.some((id) => item.blockIds.includes(id)));
    const blockSelection = previous[index];
    if (blockSelection?.type !== "block") return;
    // `ids` can be wider than this item. A mixed text selection uses partial
    // text boundary blocks plus a BlockSelection for only the fully covered
    // middle blocks. Preserve that distinction after moving the whole range.
    const remaining = blockSelection.blockIds.filter((id) => this.findBlock(id));
    if (!remaining.length) {
      this.selection.set(previous.filter((_, itemIndex) => itemIndex !== index));
      return;
    }
    const anchorBlockId = remaining.includes(blockSelection.anchorBlockId) ? blockSelection.anchorBlockId : remaining[0]!;
    const focusBlockId = remaining.includes(blockSelection.focusBlockId) ? blockSelection.focusBlockId : remaining.at(-1)!;
    const restored = { type: "block", blockIds: remaining, anchorBlockId, focusBlockId } satisfies RuntimeBlockSelection;
    this.setSelection(previous.map((item, itemIndex) => itemIndex === index ? restored : item));
  }

  /**
   * Validates and stores every item in the local selection list.
   *
   * Text offsets are checked against current block content. Block selections are
   * stored in visible document order while preserving anchor/focus direction.
   * Edgeless items are only valid while the editor is in edgeless mode. Items
   * remain separate, allowing text and whole-block selection to coexist.
   */
  private setSelection(selection: EditorSelection): void {
    if (!Array.isArray(selection)) throw new Error("Selection must be a list");
    const normalized = selection.map((item): EditorSelectionItem => {
      if (!item || !["text", "block", "edgeless"].includes(item.type)) throw new Error("Invalid selection");
      if (item.type === "text") {
        this.validatePosition(item.anchor);
        this.validatePosition(item.head);
        return item;
      }

      if (!item.blockIds.length) throw new Error("Selection requires at least one block");
      item.blockIds.forEach((id) => {
        if (!this.findBlock(id)) throw new Error(`Selection block ${id} not found`);
      });
      if (item.type === "edgeless") {
        if (this.mode.get() !== "edgeless") throw new Error("Edgeless selection requires edgeless mode");
        return item;
      }
      if (!item.blockIds.includes(item.anchorBlockId) || !item.blockIds.includes(item.focusBlockId)) {
        throw new Error("Block selection endpoints must be selected");
      }

      const selected = new Set(item.blockIds);
      const ordered: string[] = [];
      const visit = (blocks: Block[]): void => blocks.forEach((block) => {
        if (selected.has(block.id)) ordered.push(block.id);
        visit(block.children);
      });
      visit(this.document.document);
      return { ...item, blockIds: ordered };
    });
    this.selection.set(normalized);
  }

  /**
   * Reconciles local selection with the latest document and editor mode.
   *
   * Direct document edits, remote CRDT updates, undo/redo, and mode swaps can
   * remove selected blocks or make edgeless selections illegal. Structural
   * moves can also change the visible order of a BlockSelection without
   * invalidating any of its IDs. Invalid items are removed, while valid block
   * selections are reordered to match the current depth-first document tree.
   * Anchor and focus IDs remain untouched so gesture direction is preserved.
   */
  private reconcileSelection(): void {
    const selection = this.selection.get();
    const visibleIds: string[] = [];
    const visit = (blocks: Block[]): void => blocks.forEach((block) => {
      visibleIds.push(block.id);
      visit(block.children);
    });
    visit(this.document.document);
    const order = new Map(visibleIds.map((id, index) => [id, index]));
    let changed = false;
    const valid = selection.flatMap((item): EditorSelectionItem[] => {
      const ids = item.type === "text" ? [item.anchor.blockId, item.head.blockId] : item.blockIds;
      if (!ids.every((id) => order.has(id)) || (item.type === "edgeless" && this.mode.get() !== "edgeless")) {
        changed = true;
        return [];
      }
      if (item.type !== "block") return [item];
      const blockIds = [...item.blockIds].sort((left, right) => order.get(left)! - order.get(right)!);
      if (blockIds.some((id, index) => id !== item.blockIds[index])) changed = true;
      return [{ ...item, blockIds }];
    });
    if (changed) this.selection.set(valid);
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

/**
 * Creates one editor runtime over an optional collaborative document.
 *
 * @param options - Optional document adapter and initial presentation mode.
 * @returns Runtime whose lifecycle is owned by the caller.
 */
export function createRivtoEditor(options: CreateRivtoEditorOptions = {}): EditorRuntime {
  return new EditorRuntime(options);
}

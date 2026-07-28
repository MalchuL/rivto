import {
  BlockRegistry,
  DEFAULT_BLOCK_TYPE,
  defaultBlockDefinitions,
  type BlockDefinition,
} from "../blocks";
import { ClipboardManager, CommandRegistry, type CommandHandler, type RegisteredCommand, ModeManager, SelectionManager, SlashCommandManager, UndoManager } from "../managers";
import { YjsDoc } from "../store/crdt-doc";
import { DocumentModelImpl, type Block, type BlockInput, type BlockLayout, type BlockPatch, type BlockUpdate, type Link, type Snapshot, type SnapshotUpdate } from "../store/document-model";
import {
  RIVTO_CLIPBOARD_MIME,
  type ClipboardBundle,
} from "../managers/clipboard-manager";
import type { EditorBlock, EditorBlockInput, EditorBlockLayout, EditorBlockPatch, EditorBlockUpdate, EditorLink, EditorSnapshot, EditorSnapshotUpdate } from "./model";
import type { CreateRivtoEditorOptions, EditorSelection, EditorSelectionItem, RivtoEditorApi } from "./types";

type RuntimeBlockSelection = Extract<EditorSelectionItem, { type: "block" }>;

/** Framework-neutral subset of browser or host clipboard data. */
interface ClipboardDataLike {
  getData(type: string): string;
  setData(type: string, value: string): void;
}

/** Structural clipboard event accepted without importing DOM event types. */
interface ClipboardEventLike {
  readonly clipboardData: ClipboardDataLike | null;
  preventDefault(): void;
}

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
  readonly selection: SelectionManager;
  readonly history: UndoManager;
  readonly clipboard: ClipboardManager;
  readonly slashCommands = new SlashCommandManager();
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
    this.selection = new SelectionManager(this);
    this.history = new UndoManager(this.document);
    this.clipboard = new ClipboardManager(this);
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

  /** Applies several identified block patches in one command and undo item. */
  updateBlocks(updates: readonly EditorBlockUpdate[]): void {
    const command = { updates } satisfies { updates: readonly BlockUpdate[] };
    this.execute("block.update-many", command);
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
    this.commands.register("block.update-many", documentCommand((value) => {
      const data = payload(value);
      if (!Array.isArray(data.updates)) throw new Error("updates must be an array");
      const updates = data.updates.map((item) => {
        const update = payload(item);
        return {
          id: string(update.id, "id"),
          patch: payload(update.patch) as BlockPatch,
        };
      });
      this.document.updateBlocks(updates);
    }));
    this.commands.register("block.type.set", documentCommand((value) => {
      const data = payload(value);
      const id = string(data.id, "id");
      const type = string(data.type, "type");
      const prepared = this.blocks.prepare({ type });
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
      this.selection.set(data.selection as EditorSelection);
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
        event.clipboardData.setData("text/plain", payloadData.text);
      }
      if (data.clipboardData && typeof (data.clipboardData as { setData?: unknown }).setData === "function") {
        const transfer = data.clipboardData as Pick<ClipboardDataLike, "setData">;
        transfer.setData(RIVTO_CLIPBOARD_MIME, JSON.stringify(payloadData.bundle));
        transfer.setData("text/html", payloadData.html);
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
        event.clipboardData.setData("text/plain", payloadData.text);
      }
      return payloadData.text;
    });

    this.commands.register("clipboard.paste", (value) => {
      const event = clipboardEvent(value);
      const data = payload(value);
      const defaultBlockType = text(data.defaultBlockType) ?? DEFAULT_BLOCK_TYPE;
      const structured = text(data.structured)
        ?? (event?.clipboardData?.getData(RIVTO_CLIPBOARD_MIME) || undefined);
      const bundle = data.bundle as ClipboardBundle | undefined;
      const mergeText = data.mergeText !== false;
      const explicitText = text(data.text);
      if (event?.clipboardData) event.preventDefault();
      this.clipboard.paste({
        bundle,
        structured,
        mergeText,
        defaultBlockType,
        text: explicitText ?? event?.clipboardData?.getData("text/plain"),
      });
    });
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
    const range = this.selection.normalize();
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
    this.selection.set(previous.map((item, itemIndex) => itemIndex === index ? restored : item));
  }

  /**
   * Reconciles local selection with the latest document and editor mode.
   *
   * Direct document edits, remote CRDT updates, undo/redo, and mode swaps can
   * remove selected blocks, shorten selected text, or make edgeless selections
   * illegal. Surviving text offsets are clamped, deleted structural IDs are
   * filtered, and block selections are reordered to match the current tree.
   * When a block-selection endpoint disappeared, its replacement is chosen
   * from the same directional edge so top-down and bottom-up intent survives.
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
      if (item.type === "text") {
        const anchorBlock = this.findBlock(item.anchor.blockId);
        const headBlock = this.findBlock(item.head.blockId);
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

      if (item.type === "edgeless") {
        if (this.mode.get() !== "edgeless") {
          changed = true;
          return [];
        }
        const blockIds = item.blockIds.filter((id) => order.has(id));
        if (!blockIds.length) {
          changed = true;
          return [];
        }
        if (blockIds.length === item.blockIds.length) return [item];
        changed = true;
        return [{ ...item, blockIds }];
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

  /** Finds one block recursively in detached document values. */
  private findBlock(id: string, blocks: Block[] = this.document.document): Block | undefined {
    for (const block of blocks) {
      if (block.id === id) return block;
      const child = this.findBlock(id, block.children);
      if (child) return child;
    }
    return undefined;
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
    this.slashCommands.clear();
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

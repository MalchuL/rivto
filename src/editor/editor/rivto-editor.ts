import { YjsDoc } from "../../store/crdt-doc";
import { DocumentModelImpl, type Block, type BlockInput, type BlockLayout, type BlockPatch, type Link, type Snapshot } from "../../store/document-model";
import { BlockRegistry, defaultBlockDefinitions, type BlockDefinition, type SlashItem } from "../blocks";
import { ClipboardManager, PluginManager, ProviderManager, SelectionManager, UndoManager, type RivtoPlugin } from "../managers";
import type { CreateRivtoEditorOptions, EditorEvent, EditorMode, EditorSelection, MarkdownFormat, RivtoEditorApi } from "./types";

/**
 * Coordinates document storage, local managers, runtime definitions, and events.
 *
 * EditorCore is the application boundary: views and plugins use its commands,
 * while all collaborative mutations continue through DocumentModelImpl.
 */
export class RivtoEditorCore implements RivtoEditorApi {
  readonly documentModel: DocumentModelImpl;
  readonly blocks = new BlockRegistry();
  readonly selectionManager = new SelectionManager();
  readonly clipboardManager: ClipboardManager;
  readonly providerManager: ProviderManager;
  readonly undoManager: UndoManager;
  readonly pluginManager: PluginManager;
  private readonly listeners = new Map<EditorEvent, Set<() => void>>();
  private readonly unsubscribeDocument: () => void;
  private readonly unsubscribeSelection: () => void;
  private readonly removeDefinitions = new Set<() => void>();
  private currentMode: EditorMode;
  private currentRevision = 0;

  /**
   * Creates an editor over a supplied CRDT adapter or a fresh Yjs-backed adapter.
   *
   * Built-in definitions and configured plugins are installed before initial
   * content, ensuring every editor-created block is validated by its definition.
   */
  constructor(options: CreateRivtoEditorOptions = {}) {
    this.documentModel = new DocumentModelImpl(options.document ?? new YjsDoc(`rivto-${crypto.randomUUID()}`));
    this.clipboardManager = new ClipboardManager(this.documentModel, this.selectionManager);
    this.providerManager = new ProviderManager(this.documentModel);
    this.undoManager = new UndoManager(this.documentModel);
    this.pluginManager = new PluginManager(() => this, this.blocks, () => this.changed());
    this.currentMode = options.mode ?? "page";
    this.documentModel.setPropsValidator((type, props) => this.blocks.validate(type, props));
    defaultBlockDefinitions.forEach((definition) => this.defineBlock(definition));
    options.plugins?.forEach((plugin) => this.use(plugin));
    if (this.documentModel.isEmpty && options.initialContent?.length) {
      options.initialContent.forEach((block) => this.insertBlock(block));
      this.undoManager.clear();
    }
    this.unsubscribeDocument = this.documentModel.subscribe(() => this.changed());
    this.unsubscribeSelection = this.selectionManager.subscribe(() => this.emit("selection"));
  }

  /** Returns the detached ordered collaborative block tree. */
  get document(): Block[] { return this.documentModel.document; }

  /** Returns detached first-class links. */
  get links(): Link[] { return this.documentModel.links; }

  /** Returns a detached copy of local directed selection. */
  get selection(): EditorSelection | null { return this.selectionManager.get(); }

  /** Returns the current local renderer mode. */
  get mode(): EditorMode { return this.currentMode; }

  /** Returns the monotonic view invalidation counter. */
  get revision(): number { return this.currentRevision; }

  /** Creates a registered block after applying definition defaults and validation. */
  insertBlock(block: BlockInput, afterId?: string | null): string {
    return this.documentModel.insertBlock(this.blocks.prepare(block), afterId);
  }

  /** Patches mutable block fields without allowing identity or type changes. */
  updateBlock(id: string, patch: BlockPatch): void { this.documentModel.updateBlock(id, patch); }

  /** Removes a block subtree and clears selection if either endpoint disappeared. */
  removeBlock(id: string): void {
    this.documentModel.removeBlock(id);
    const selection = this.selection;
    if (selection && (!this.findBlock(selection.anchor.blockId) || !this.findBlock(selection.head.blockId))) this.selectionManager.clear();
  }

  /** Reorders a block after a sibling in their ordered container. */
  moveBlock(id: string, afterId: string | null): void { this.documentModel.moveBlock(id, afterId); }

  /** Nests a block under its preceding sibling. */
  indentBlock(id: string): void { this.documentModel.indentBlock(id); }

  /** Moves a nested block directly after its parent. */
  outdentBlock(id: string): void { this.documentModel.outdentBlock(id); }

  /** Reconciles complete Markdown source with collaborative text. */
  setBlockText(id: string, value: string): void { this.documentModel.setBlockText(id, value); }

  /** Inserts text at a clamped UTF-16 block offset. */
  insertText(id: string, offset: number, text: string): void { this.documentModel.insertText(id, offset, text); }

  /** Deletes text from a clamped UTF-16 block range. */
  deleteText(id: string, offset: number, length: number): void { this.documentModel.deleteText(id, offset, length); }

  /** Sets or removes one validated block property. */
  setBlockProp(id: string, key: string, value: unknown): void { this.documentModel.setBlockProp(id, key, value); }

  /** Sets or removes data under one plugin-owned namespace. */
  setPluginData(id: string, pluginId: string, value: unknown): void { this.documentModel.setPluginData(id, pluginId, value); }

  /** Wraps a non-empty text range in ordinary Markdown source syntax. */
  formatText(id: string, from: number, length: number, format: MarkdownFormat, value?: string): void {
    if (length <= 0) return;
    const wrappers: Record<Exclude<MarkdownFormat, "link">, string> = { bold: "**", italic: "*", strike: "~~", code: "`" };
    const [prefix, suffix] = format === "link" ? ["[", `](${value ?? ""})`] : [wrappers[format], wrappers[format]];
    this.documentModel.transact(() => {
      this.documentModel.insertText(id, from + length, suffix);
      this.documentModel.insertText(id, from, prefix);
    });
  }

  /** Copies current selection in all supported clipboard formats. */
  copy(): Promise<string> { return this.clipboardManager.copy(); }

  /** Copies and deletes current selection. */
  cut(): Promise<string> { return this.clipboardManager.cut(); }

  /** Pastes data using an explicit native type when plain text creates a block. */
  paste(defaultBlockType: string, text?: string): Promise<void> { return this.clipboardManager.paste(defaultBlockType, text); }

  /** Validates selection positions against the current document before storing them. */
  setSelection(selection: EditorSelection | null): void {
    if (!selection) return this.selectionManager.clear();
    this.validatePosition(selection.anchor);
    this.validatePosition(selection.head);
    this.selectionManager.set(selection);
  }

  /** Changes local renderer mode and notifies views only when it changed. */
  setMode(mode: EditorMode): void {
    if (mode === this.currentMode) return;
    this.currentMode = mode;
    this.emit("mode");
  }

  /** Patches collaborative geometry without replacing its CRDT map. */
  setBlockLayout(id: string, layout: Partial<BlockLayout>): void { this.documentModel.setBlockLayout(id, layout); }

  /** Creates or replaces a first-class document link. */
  createLink(link: Link): void { this.documentModel.createLink(link); }

  /** Removes a first-class document link by ID. */
  removeLink(id: string): void { this.documentModel.removeLink(id); }

  /** Reverts the latest captured local operation. */
  undo(): void { this.undoManager.undo(); }

  /** Reapplies the latest locally undone operation. */
  redo(): void { this.undoManager.redo(); }

  /** Requests DOM focus without coupling the editor to a React renderer instance. */
  focus(blockId?: string): void {
    this.emit("focus");
    if (typeof document === "undefined") return;
    queueMicrotask(() => {
      const selector = blockId
        ? `[data-rivto-block="${CSS.escape(blockId)}"] [contenteditable="true"]`
        : `[data-rivto-editor] [contenteditable="true"]`;
      document.querySelector<HTMLElement>(selector)?.focus();
    });
  }

  /** Returns a lossless detached schema-v3 snapshot. */
  getSnapshot(): Snapshot { return this.documentModel.getSnapshot(); }

  /** Replaces collaborative content and discards history from the prior state. */
  loadSnapshot(snapshot: Snapshot): void {
    this.documentModel.loadSnapshot(snapshot);
    this.undoManager.clear();
  }

  /** Registers one native block definition and invalidates views on changes. */
  defineBlock(definition: BlockDefinition): () => void {
    const remove = this.blocks.register(definition);
    let active = true;
    const dispose = () => {
      if (!active) return;
      active = false;
      remove();
      this.removeDefinitions.delete(dispose);
      this.changed();
    };
    this.removeDefinitions.add(dispose);
    this.changed();
    return dispose;
  }

  /** Installs a trusted runtime plugin and returns its lifecycle disposer. */
  use(plugin: RivtoPlugin): () => void { return this.pluginManager.use(plugin); }

  /** Runs a named command owned by an installed plugin. */
  runCommand(name: string, ...args: unknown[]): unknown { return this.pluginManager.run(name, ...args); }

  /** Combines definition-generated and plugin-generated slash actions. */
  getSlashItems(): SlashItem[] { return [...this.blocks.getSlashItems(), ...this.pluginManager.getSlashItems()]; }

  /** Subscribes a framework view to one editor event stream. */
  subscribe(event: EditorEvent, listener: () => void): () => void {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return () => listeners.delete(listener);
  }

  /** Releases document, selection, history, plugin, definition, and view listeners. */
  destroy(): void {
    this.unsubscribeDocument();
    this.unsubscribeSelection();
    this.undoManager.destroy();
    this.pluginManager.destroy();
    [...this.removeDefinitions].reverse().forEach((remove) => remove());
    this.listeners.clear();
  }

  /** Finds one block recursively in the current detached document tree. */
  private findBlock(id: string, blocks: Block[] = this.document): Block | undefined {
    for (const block of blocks) {
      if (block.id === id) return block;
      const child = this.findBlock(id, block.children);
      if (child) return child;
    }
    return undefined;
  }

  /** Rejects missing blocks and offsets outside their current Markdown source. */
  private validatePosition(position: EditorSelection["anchor"]): void {
    const block = this.findBlock(position.blockId);
    if (!block) throw new Error(`Selection block ${position.blockId} not found`);
    if (!Number.isInteger(position.offset) || position.offset < 0 || position.offset > block.content.length) {
      throw new Error(`Selection offset ${position.offset} is outside block ${position.blockId}`);
    }
  }

  /** Increments the revision and publishes a document-level invalidation. */
  private changed(): void {
    this.currentRevision += 1;
    this.emit("document");
  }

  /** Notifies a stable snapshot of listeners for one editor event. */
  private emit(event: EditorEvent): void {
    [...(this.listeners.get(event) ?? [])].forEach((listener) => listener());
  }
}

/** Creates a fully initialized editor runtime. */
export function createRivtoEditor(options: CreateRivtoEditorOptions = {}): RivtoEditorCore {
  return new RivtoEditorCore(options);
}

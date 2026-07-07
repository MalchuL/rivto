import { YjsDoc } from "../../store/crdt-doc";
import { DocumentModelImpl, type Block, type BlockInput, type BlockLayout, type BlockPatch, type Link, type SnapshotUpdate } from "../../store/document-model";
import { BlockRegistry, defaultBlockDefinitions, type BlockDefinition } from "../blocks";
import {
  ClipboardManager,
  CommandRegistry,
  EventRouter,
  HistoryManager,
  ModeManager,
  PluginManager,
  ProviderManager,
  SelectionManager,
  UIRegistry,
  type RivtoPlugin,
} from "../managers";
import type { BuiltInCommandMap, CreateRivtoEditorOptions, EditorPosition, EditorSelection, MarkdownFormat, RivtoEditorApi, RuntimeEvent } from "./types";

type Payload = Record<string, unknown>;
type RuntimeBlockSelection = Extract<EditorSelection, { type: "block" }>;
type PayloadCommandName =
  | "block.insert" | "block.update" | "block.remove" | "block.move" | "block.indent" | "block.outdent"
  | "text.set" | "text.insert" | "text.delete" | "text.format"
  | "block.prop.set" | "block.pluginData.set" | "block.layout.set"
  | "link.create" | "link.remove" | "selection.set" | "mode.set"
  | "clipboard.paste" | "clipboard.copyEvent" | "clipboard.pasteEvent" | "document.load";
type PayloadCommandResult = string | void | Promise<void>;

// Static command types help TypeScript callers, but built-ins still validate at
// this trust boundary because JavaScript and external data bypass those types.
const payload = (value: unknown): Payload => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Command payload must be an object");
  return value as Payload;
};
const string = (value: unknown, name: string): string => {
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  return value;
};
const number = (value: unknown, name: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${name} must be a number`);
  return value;
};

/**
 * Framework-independent, command-driven editing session.
 *
 * EditorRuntime is the boundary between collaborative document data and local
 * editing state. It owns registries and managers, registers the canonical
 * command/event behavior, and publishes one render invalidation stream. React
 * consumes this API but no runtime manager depends on React or native Yjs.
 *
 * Document mutations exposed to views and plugins must pass through
 * `commands.execute()`. The public `document` remains available for persistence,
 * providers, and advanced integrations such as AI, whose direct changes still
 * reach views through the document subscription.
 */
export class EditorRuntime implements RivtoEditorApi {
  readonly document: DocumentModelImpl;
  readonly blocks = new BlockRegistry();
  readonly commands = new CommandRegistry<BuiltInCommandMap>();
  readonly selection = new SelectionManager();
  readonly mode: ModeManager;
  readonly history: HistoryManager;
  readonly events: EventRouter;
  readonly ui = new UIRegistry();
  readonly clipboard: ClipboardManager;
  readonly providers: ProviderManager;
  readonly plugins: PluginManager;
  private readonly listeners = new Set<() => void>();
  private readonly cleanup: Array<() => void> = [];
  private readonly removeDefinitions = new Set<() => void>();
  private currentRevision = 0;

  /**
   * Creates a runtime over a supplied or fresh collaborative document.
   *
   * Construction order is significant: commands and definitions must exist
   * before initial content is inserted, while subscriptions are attached only
   * after initialization so consumers never observe a half-built runtime.
   * Initial content uses normal commands and then clears history, making the
   * seed state a baseline rather than the user's first undo step.
   *
   * @param options - Document adapter, initial mode/content, and trusted plugins.
   */
  constructor(options: CreateRivtoEditorOptions = {}) {
    this.document = new DocumentModelImpl(options.document ?? new YjsDoc(`rivto-${crypto.randomUUID()}`));
    this.mode = new ModeManager(options.mode ?? "block");
    this.history = new HistoryManager(this.document);
    this.clipboard = new ClipboardManager(this.document, this.selection);
    this.providers = new ProviderManager(this.document);
    this.events = new EventRouter(() => this, this.blocks, () => this.mode.get());
    this.plugins = new PluginManager(
      () => this, this.blocks, this.commands, this.events, this.ui,
      () => this.mode.get(), () => this.changed(),
    );
    this.registerBuiltInCommands();
    this.registerFallbackEvents();
    this.document.setPropsValidator((type, props) => this.blocks.validate(type, props));
    defaultBlockDefinitions.forEach((definition) => this.defineBlock(definition));
    options.plugins?.forEach((plugin) => this.use(plugin));
    if (this.document.isEmpty && options.initialContent?.length) {
      options.initialContent.forEach((block) => this.commands.execute("block.insert", { block }));
      this.history.clear();
    }
    this.cleanup.push(
      this.document.subscribe(() => { this.reconcileSelection(); this.changed(); }),
      this.selection.subscribe(() => this.changed()),
      this.mode.subscribe(() => { this.reconcileSelection(); this.changed(); }),
    );
  }

  /**
   * Returns the monotonic render invalidation counter.
   *
   * Consumers use the number only as an external-store snapshot; collaborative
   * content remains authoritative in DocumentModelImpl.
   */
  get revision(): number { return this.currentRevision; }

  /**
   * Subscribes a renderer to document, mode, selection, or extension changes.
   *
   * @param listener - View invalidation callback.
   * @returns Function that removes this listener.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Requests DOM focus without storing DOM state in the runtime.
   *
   * Focus is deferred because commands commonly insert a block first and React
   * must commit that block before it can be queried. The method is a no-op in
   * server and unit-test environments.
   *
   * @param blockId - Optional block to focus; omitted focuses the first editor.
   */
  focus(blockId?: string): void {
    if (typeof document === "undefined") return;
    queueMicrotask(() => {
      const selector = blockId
        ? `[data-rivto-block="${CSS.escape(blockId)}"] [contenteditable="true"]`
        : `[data-rivto-editor] [contenteditable="true"]`;
      document.querySelector<HTMLElement>(selector)?.focus();
    });
  }

  /**
   * Registers a native block definition until its disposer runs.
   *
   * Runtime-owned wrapping adds view invalidation and makes disposal idempotent
   * while BlockRegistry remains a small definition map.
   *
   * @param definition - Unique native block definition.
   * @returns Definition disposer.
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

  /** Installs a trusted runtime plugin through atomic lifecycle ownership. */
  use(plugin: RivtoPlugin): () => void { return this.plugins.use(plugin); }

  /**
   * Releases all runtime-owned resources.
   *
   * External document ownership is unchanged: a CRDT adapter supplied by the
   * host must still be destroyed by that host. Runtime subscriptions are
   * removed before plugin cleanup so teardown cannot react to document changes.
   */
  destroy(): void {
    this.cleanup.splice(0).forEach((dispose) => dispose());
    this.plugins.destroy();
    this.history.destroy();
    [...this.removeDefinitions].reverse().forEach((dispose) => dispose());
    this.commands.clear();
    this.listeners.clear();
  }

  /**
   * Registers the canonical mutation command set.
   *
   * The local `register` adapter enforces object payloads consistently. Each
   * command validates primitive fields, then delegates the actual transaction
   * and CRDT semantics to DocumentModelImpl or the responsible manager.
   */
  private registerBuiltInCommands(): void {
    const register = (
      name: PayloadCommandName,
      handler: (data: Payload) => PayloadCommandResult,
    ): void => {
      this.commands.register<Record<PayloadCommandName, (value: unknown) => PayloadCommandResult>>(name, (value) => handler(payload(value)));
    };
    register("block.insert", (data) => {
      const block = payload(data.block) as unknown as BlockInput;
      if (typeof block.type !== "string") throw new Error("block.type must be a string");
      const definition = this.blocks.get(block.type);
      const render = definition?.render;
      if (!definition || (render && typeof render !== "function" && !render[this.mode.get()])) {
        throw new Error(`Block type ${block.type} is unavailable in ${this.mode.get()} mode`);
      }
      // `undefined` appends while explicit `null` inserts first. Collapsing both
      // values here would silently change DocumentModel's ordering contract.
      const afterId = data.afterId === undefined ? undefined : data.afterId === null ? null : string(data.afterId, "afterId");
      return this.document.insertBlock(this.blocks.prepare(block), afterId);
    });
    register("block.update", (data) => this.document.updateBlock(string(data.id, "id"), payload(data.patch) as BlockPatch));
    register("block.remove", (data) => this.document.transact(() => this.selectedBlockIds(string(data.id, "id")).forEach((id) => this.document.removeBlock(id))));
    register("block.move", (data) => this.document.moveBlock(string(data.id, "id"), data.afterId === null ? null : string(data.afterId, "afterId")));
    register("block.indent", (data) => {
      const before = this.selection.get();
      const ids = this.selectedBlockIds(string(data.id, "id"));
      this.document.transact(() => ids.forEach((id) => this.document.indentBlock(id)));
      this.restoreBlockSelection(before, ids);
    });
    register("block.outdent", (data) => {
      const before = this.selection.get();
      const ids = this.selectedBlockIds(string(data.id, "id"));
      this.document.transact(() => {
        // Moving nested siblings upward inserts each one after its parent. Walking
        // bottom-to-top preserves their visual order: B,C under A becomes A,B,C.
        [...ids].reverse().forEach((id) => this.document.outdentBlock(id));
      });
      this.restoreBlockSelection(before, ids);
    });
    register("text.set", (data) => this.document.setBlockText(string(data.id, "id"), string(data.text, "text")));
    register("text.insert", (data) => this.document.insertText(string(data.id, "id"), number(data.offset, "offset"), string(data.text, "text")));
    register("text.delete", (data) => this.document.deleteText(string(data.id, "id"), number(data.offset, "offset"), number(data.length, "length")));
    register("text.format", (data) => this.formatText(
      string(data.id, "id"), number(data.from, "from"), number(data.length, "length"), this.markdownFormat(data.format),
      data.value === undefined ? undefined : string(data.value, "value"),
    ));
    register("block.prop.set", (data) => this.document.setBlockProp(string(data.id, "id"), string(data.key, "key"), data.value));
    register("block.pluginData.set", (data) => this.document.setPluginData(string(data.id, "id"), string(data.pluginId, "pluginId"), data.value));
    register("block.layout.set", (data) => this.document.setBlockLayout(string(data.id, "id"), payload(data.layout) as Partial<BlockLayout>));
    register("link.create", (data) => this.document.createLink(payload(data.link) as unknown as Link));
    register("link.remove", (data) => this.document.removeLink(string(data.id, "id")));
    register("selection.set", (data) => this.setSelection(data.selection as EditorSelection));
    this.commands.register("selection.clear", () => this.selection.clear());
    register("mode.set", (data) => {
      const mode = string(data.mode, "mode");
      if (mode !== "block" && mode !== "edgeless") throw new Error("mode must be block or edgeless");
      this.mode.set(mode);
    });
    this.commands.register("history.undo", () => this.history.undo());
    this.commands.register("history.redo", () => this.history.redo());
    this.commands.register("clipboard.copy", () => this.clipboard.copy());
    this.commands.register("clipboard.cut", () => this.clipboard.cut());
    register("clipboard.paste", (data) => this.clipboard.paste(string(data.defaultBlockType, "defaultBlockType"), data.text as string | undefined));
    register("clipboard.copyEvent", (data) => this.clipboard.handleCopyEvent(data.event as ClipboardEvent));
    register("clipboard.pasteEvent", (data) => this.clipboard.handlePasteEvent(data.event as ClipboardEvent, string(data.defaultBlockType, "defaultBlockType")));
    register("document.load", (data) => { this.document.loadSnapshot(data.snapshot as SnapshotUpdate); this.history.clear(); });
  }

  /**
   * Registers built-in handlers that run after global and block-scoped plugins.
   *
   * Fallbacks claim only events they can fully handle. This lets extensions
   * override keyboard or drop semantics by returning `true` earlier in the
   * EventRouter pipeline.
   */
  private registerFallbackEvents(): void {
    this.events.registerFallback("keydown", (event) => this.handleKeydown(event));
    this.events.registerFallback("drop", (event) => {
      const data = payload(event.payload);
      if (this.mode.get() !== "block" || !event.blockId || typeof data.sourceId !== "string" || data.sourceId === event.blockId) return false;
      this.commands.execute("block.move", { id: data.sourceId, afterId: event.blockId });
      return true;
    });
  }

  /**
   * Implements default writing key behavior exclusively through commands.
   *
   * @param event - Normalized key event plus renderer context.
   * @returns Whether a built-in shortcut handled the event.
   */
  private handleKeydown(event: RuntimeEvent): boolean {
    if (!event.blockId || !event.key) return false;
    const data = (event.payload && typeof event.payload === "object" ? event.payload : {}) as Payload;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      this.commands.execute(event.shiftKey ? "history.redo" : "history.undo");
    } else if (event.key === "Enter" && !event.shiftKey) {
      const id = this.commands.execute("block.insert", { block: { type: string(data.defaultBlockType, "defaultBlockType") }, afterId: event.blockId });
      this.focus(id);
    } else if (event.key === "Backspace" && data.empty === true) {
      this.commands.execute("block.remove", { id: event.blockId });
    } else if (event.key === "Tab") {
      const selection = this.selection.get();
      this.commands.execute(event.shiftKey ? "block.outdent" : "block.indent", {
        id: selection?.type === "block" ? selection.focusBlockId : event.blockId,
      });
    } else return false;
    return true;
  }

  /**
   * Applies one Markdown wrapper transaction.
   *
   * The suffix is inserted first so the original `from` offset is still valid
   * when the prefix is inserted. Both operations share one outer transaction,
   * preventing collaborators from observing a half-formatted range.
   */
  private formatText(id: string, from: number, length: number, format: MarkdownFormat, value?: string): void {
    if (length <= 0) return;
    const wrappers: Record<Exclude<MarkdownFormat, "link">, string> = { bold: "**", italic: "*", strike: "~~", code: "`" };
    const [prefix, suffix] = format === "link" ? ["[", `](${value ?? ""})`] : [wrappers[format], wrappers[format]];
    this.document.transact(() => {
      this.document.insertText(id, from + length, suffix);
      this.document.insertText(id, from, prefix);
    });
  }

  /**
   * Expands a single-block command to the active block selection when possible.
   *
   * Toolbar buttons and key handlers naturally know the block that received the
   * event, but a marquee selection means the user's intent is "act on all these
   * blocks". Requiring every renderer to repeat that check would make selection
   * semantics drift; keeping it at the command boundary gives plugins the same
   * behavior for free.
   */
  private selectedBlockIds(id: string): string[] {
    const selection = this.selection.get();
    return selection?.type === "block" && selection.blockIds.includes(id) ? selection.blockIds : [id];
  }

  /** Re-publishes block selection after structural moves reorder the document tree. */
  private restoreBlockSelection(previous: EditorSelection | null, ids: string[]): void {
    if (previous?.type !== "block") return;
    const remaining = ids.filter((id) => this.findBlock(id));
    if (!remaining.length) return this.selection.clear();
    const anchorBlockId = remaining.includes(previous.anchorBlockId) ? previous.anchorBlockId : remaining[0]!;
    const focusBlockId = remaining.includes(previous.focusBlockId) ? previous.focusBlockId : remaining.at(-1)!;
    this.setSelection({ type: "block", blockIds: remaining, anchorBlockId, focusBlockId } satisfies RuntimeBlockSelection);
  }

  /** Validates a supported Markdown format at the command boundary. */
  private markdownFormat(value: unknown): MarkdownFormat {
    const format = string(value, "format");
    if (!["bold", "italic", "strike", "code", "link"].includes(format)) throw new Error(`Unknown Markdown format ${format}`);
    return format as MarkdownFormat;
  }

  /**
   * Validates and stores a discriminated local selection.
   *
   * Text offsets are checked against the current detached Markdown source.
   * Block selection endpoints must belong to the selected set, while edgeless
   * object selection is rejected outside edgeless mode.
   */
  private setSelection(selection: EditorSelection): void {
    if (!selection || !["text", "block", "edgeless"].includes(selection.type)) throw new Error("Invalid selection");
    if (selection.type === "text") {
      this.validatePosition(selection.anchor);
      this.validatePosition(selection.head);
    } else {
      if (!selection.blockIds.length) throw new Error("Selection requires at least one block");
      selection.blockIds.forEach((id) => { if (!this.findBlock(id)) throw new Error(`Selection block ${id} not found`); });
      if (selection.type === "block" && (!selection.blockIds.includes(selection.anchorBlockId) || !selection.blockIds.includes(selection.focusBlockId))) {
        throw new Error("Block selection endpoints must be selected");
      }
      if (selection.type === "edgeless" && this.mode.get() !== "edgeless") throw new Error("Edgeless selection requires edgeless mode");
      if (selection.type === "block") {
        // Callers preserve anchor/focus direction, while the selected IDs have
        // one canonical document order. This mirrors BlockSuite's separation
        // between directed text endpoints and ordered block selections.
        const selected = new Set(selection.blockIds);
        const ordered: string[] = [];
        const visit = (blocks: Block[]): void => blocks.forEach((block) => {
          if (selected.has(block.id)) ordered.push(block.id);
          visit(block.children);
        });
        visit(this.document.document);
        this.selection.set({ ...selection, blockIds: ordered });
        return;
      }
    }
    this.selection.set(selection);
  }

  /**
   * Clears selection made invalid by document or mode changes.
   *
   * This runs from document subscriptions as well as mode subscriptions, so a
   * remote or direct DocumentModel deletion cannot leave dangling local IDs.
   */
  private reconcileSelection(): void {
    const selection = this.selection.get();
    if (!selection) return;
    const ids = selection.type === "text"
      ? [selection.anchor.blockId, selection.head.blockId]
      : selection.blockIds;
    if (ids.some((id) => !this.findBlock(id)) || (selection.type === "edgeless" && this.mode.get() !== "edgeless")) this.selection.clear();
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

  /** Increments the external-store snapshot and notifies a stable listener copy. */
  private changed(): void {
    this.currentRevision += 1;
    [...this.listeners].forEach((listener) => listener());
  }
}

/**
 * Creates a fully initialized editor runtime.
 *
 * @param options - Optional document, initial mode/content, and plugins.
 * @returns Long-lived runtime owned by the caller.
 */
export function createRivtoEditor(options: CreateRivtoEditorOptions = {}): EditorRuntime {
  return new EditorRuntime(options);
}

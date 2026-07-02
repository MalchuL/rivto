import { YjsDoc } from "../store/crdt-doc";
import { DocumentModelImpl } from "../store/document-model";
import { defaultWritingPlugin } from "./defaults";
import { ClipboardManager, PluginManager, ProviderManager, SelectionManager, UndoManager } from "./managers";
import type {
  BlockLayout,
  CreateRivtoEditorOptions,
  EditorBlock,
  EditorLink,
  EditorMode,
  EditorSelection,
  EditorSnapshot,
  MarkdownFormat,
  PartialEditorBlock,
  RivtoEditorApi,
  RivtoPlugin,
} from "./types";

type ListenerEvent = "document" | "selection" | "mode" | "focus";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class RivtoEditorCore implements RivtoEditorApi {
  readonly documentModel: DocumentModelImpl;
  readonly selectionManager: SelectionManager;
  readonly clipboardManager: ClipboardManager;
  readonly providerManager: ProviderManager;
  readonly undoManager: UndoManager;
  readonly pluginManager: PluginManager;
  private readonly listeners = new Map<ListenerEvent, Set<() => void>>();
  private readonly unsubscribeDocument: () => void;
  private readonly unsubscribeSelection: () => void;
  private _mode: EditorMode;
  private _revision = 0;

  constructor(options: CreateRivtoEditorOptions = {}) {
    this.documentModel = new DocumentModelImpl(options.document ?? new YjsDoc(`rivto-${crypto.randomUUID()}`));
    this.selectionManager = new SelectionManager();
    this.clipboardManager = new ClipboardManager(this.documentModel, this.selectionManager);
    this.providerManager = new ProviderManager(this.documentModel);
    this.undoManager = new UndoManager(this.documentModel);
    this.pluginManager = new PluginManager(() => this, () => this.changed());
    this._mode = options.mode ?? "page";

    this.documentModel.setPropsValidator((type, props) => this.pluginManager.getBlockSpec(type)?.propSchema?.parse(props) ?? props);
    this.registerPlugin(defaultWritingPlugin);
    options.plugins?.forEach((plugin) => this.registerPlugin(plugin));
    if (this.documentModel.isEmpty && options.initialContent?.length) {
      options.initialContent.forEach((block) => this.documentModel.insertBlock(block));
      this.undoManager.clear();
    }

    this.unsubscribeDocument = this.documentModel.subscribe(() => this.changed());
    this.unsubscribeSelection = this.selectionManager.subscribe(() => this.emit("selection"));
  }

  get document(): EditorBlock[] { return this.documentModel.document; }
  get links(): EditorLink[] { return this.documentModel.links; }
  get selection(): EditorSelection | null { return this.selectionManager.selection; }
  get mode(): EditorMode { return this._mode; }
  get revision(): number { return this._revision; }

  insertBlock(block: PartialEditorBlock = {}, afterId?: string | null): string {
    return this.documentModel.insertBlock(block, afterId);
  }

  updateBlock(id: string, patch: PartialEditorBlock): void { this.documentModel.updateBlock(id, patch); }
  removeBlock(id: string): void {
    this.documentModel.removeBlock(id);
    if (this.selection?.anchor.blockId === id || this.selection?.head.blockId === id) this.setSelection(null);
  }
  moveBlock(id: string, afterId: string | null): void { this.documentModel.moveBlock(id, afterId); }
  indentBlock(id: string): void { this.documentModel.indentBlock(id); }
  outdentBlock(id: string): void { this.documentModel.outdentBlock(id); }

  setBlockText(id: string, value: string): void {
    this.documentModel.setBlockText(id, value);
  }

  insertText(id: string, offset: number, text: string): void {
    this.documentModel.insertText(id, offset, text);
  }

  deleteText(id: string, offset: number, length: number): void {
    this.documentModel.deleteText(id, offset, length);
  }

  setBlockProp(id: string, key: string, value: unknown): void {
    this.documentModel.setBlockProp(id, key, value);
  }

  setPluginData(id: string, pluginId: string, value: unknown): void {
    this.documentModel.setPluginData(id, pluginId, value);
  }

  formatText(id: string, from: number, length: number, format: MarkdownFormat, value?: string): void {
    if (length <= 0) return;
    const wrappers: Record<Exclude<MarkdownFormat, "link">, string> = {
      bold: "**",
      italic: "*",
      strike: "~~",
      code: "`",
    };
    const [prefix, suffix] = format === "link"
      ? ["[", `](${value ?? ""})`]
      : [wrappers[format], wrappers[format]];
    this.documentModel.transact(() => {
      this.documentModel.insertText(id, from + length, suffix);
      this.documentModel.insertText(id, from, prefix);
    });
  }

  copy(): Promise<string> { return this.clipboardManager.copy(); }
  cut(): Promise<string> { return this.clipboardManager.cut(); }
  paste(text?: string): Promise<void> { return this.clipboardManager.paste(text); }
  setSelection(selection: EditorSelection | null): void { this.selectionManager.set(selection); }

  setMode(mode: EditorMode): void {
    if (mode === this._mode) return;
    this._mode = mode;
    this.emit("mode");
  }

  setBlockLayout(id: string, layout: Partial<BlockLayout>): void { this.documentModel.setBlockLayout(id, layout); }
  createLink(link: EditorLink): void { this.documentModel.createLink(link); }
  removeLink(id: string): void { this.documentModel.removeLink(id); }
  undo(): void { this.undoManager.undo(); }
  redo(): void { this.undoManager.redo(); }

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

  getSnapshot(): EditorSnapshot { return this.documentModel.getSnapshot(); }
  loadSnapshot(snapshot: EditorSnapshot): void {
    this.documentModel.loadSnapshot(snapshot);
    this.undoManager.clear();
  }

  registerPlugin(plugin: RivtoPlugin): () => void {
    return this.pluginManager.register(plugin);
  }

  runCommand(name: string, ...args: unknown[]): unknown {
    return this.pluginManager.runCommand(name, ...args);
  }

  getBlockSpec(type: string) { return this.pluginManager.getBlockSpec(type); }
  getSlashItems() { return this.pluginManager.getSlashItems(); }

  subscribe(event: ListenerEvent, listener: () => void): () => void {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return () => listeners.delete(listener);
  }

  destroy(): void {
    this.unsubscribeDocument();
    this.unsubscribeSelection();
    this.undoManager.destroy();
    this.pluginManager.destroy();
    this.listeners.clear();
  }

  private changed(): void {
    this._revision += 1;
    this.emit("document");
  }

  private emit(event: ListenerEvent): void {
    this.listeners.get(event)?.forEach((listener) => listener());
  }
}

export const createRivtoEditor = (options: CreateRivtoEditorOptions = {}): RivtoEditorCore => new RivtoEditorCore(options);

export const migrateDocumentBundleV1 = (bundle: {
  version: number;
  blocks: Array<Record<string, unknown>>;
  links?: EditorLink[];
  plugins?: Record<string, unknown>;
}): EditorSnapshot => ({
  version: 3,
  blocks: [...(bundle.blocks ?? [])]
    .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
    .map((block) => {
      const meta = clone((block.meta as Record<string, unknown> | undefined) ?? {});
      const text = typeof meta.text === "string" ? meta.text : "";
      delete meta.text;
      return {
        id: String(block.id),
        type: String(block.type ?? "paragraph"),
        props: meta,
        pluginData: clone((block.pluginStates as Record<string, unknown> | undefined) ?? {}),
        content: text,
        children: [],
        layout: {
          x: Number((block.position as { x?: number } | undefined)?.x ?? 40),
          y: Number((block.position as { y?: number } | undefined)?.y ?? 40),
          width: Number((block.size as { width?: number } | undefined)?.width ?? 320),
          height: Number((block.size as { height?: number } | undefined)?.height ?? 120),
          zIndex: Number(block.zIndex ?? 0),
        },
      };
    }),
  links: clone(bundle.links ?? []),
  pluginData: clone(bundle.plugins ?? {}),
});

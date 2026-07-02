import type { CRDTUndoManager, Provider, Unsubscribe } from "../store/crdt-doc";
import type { DocumentModelImpl } from "../store/document-model";
import type {
  BlockSpec,
  EditorBlock,
  EditorLink,
  EditorSelection,
  PartialEditorBlock,
  RivtoEditorApi,
  RivtoPlugin,
  SlashItem,
} from "./types";

export const RIVTO_CLIPBOARD_MIME = "application/x-rivto+json";

export class SelectionManager {
  private value: EditorSelection | null = null;
  private readonly listeners = new Set<() => void>();

  get selection(): EditorSelection | null {
    return this.value;
  }

  set(selection: EditorSelection | null): void {
    this.value = selection;
    this.listeners.forEach((listener) => listener());
  }

  subscribe(listener: () => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export class UndoManager {
  private readonly manager: CRDTUndoManager;

  constructor(document: DocumentModelImpl) {
    this.manager = document.crdt.createUndoManager(document.undoScopes, [document.origin]);
  }

  undo(): void { this.manager.undo(); }
  redo(): void { this.manager.redo(); }
  clear(): void { this.manager.clear(); }
  stopCapturing(): void { this.manager.stopCapturing(); }
  destroy(): void { this.manager.destroy(); }
}

export class ProviderManager {
  constructor(private readonly document: DocumentModelImpl) {}

  attach(provider: Provider): Promise<void> {
    return this.document.crdt.attachProvider(provider);
  }

  detach(): Promise<void> {
    return this.document.crdt.detachProvider();
  }
}

export class PluginManager {
  private readonly blockSpecs = new Map<string, BlockSpec>();
  private readonly plugins = new Map<string, { plugin: RivtoPlugin; dispose?: () => void }>();
  private readonly commands = new Map<string, { pluginId: string; run: (...args: unknown[]) => unknown }>();

  constructor(private readonly getEditor: () => RivtoEditorApi, private readonly onChange: () => void) {}

  register(plugin: RivtoPlugin): () => void {
    if (this.plugins.has(plugin.id)) throw new Error(`Plugin ${plugin.id} is already registered`);
    for (const spec of plugin.blocks ?? []) {
      if (this.blockSpecs.has(spec.type)) throw new Error(`Block type ${spec.type} is already registered`);
      this.blockSpecs.set(spec.type, spec);
    }
    for (const [name, command] of Object.entries(plugin.commands ?? {})) {
      if (this.commands.has(name)) throw new Error(`Command ${name} is already registered`);
      this.commands.set(name, { pluginId: plugin.id, run: (...args) => command(this.getEditor(), ...args) });
    }
    const dispose = plugin.onRegister?.(this.getEditor()) || undefined;
    this.plugins.set(plugin.id, { plugin, dispose });
    this.onChange();
    return () => this.unregister(plugin.id);
  }

  unregister(id: string): void {
    const current = this.plugins.get(id);
    if (!current) return;
    current.dispose?.();
    current.plugin.blocks?.forEach((spec) => this.blockSpecs.delete(spec.type));
    for (const [name, command] of this.commands) if (command.pluginId === id) this.commands.delete(name);
    this.plugins.delete(id);
    this.onChange();
  }

  runCommand(name: string, ...args: unknown[]): unknown {
    const command = this.commands.get(name);
    if (!command) throw new Error(`Unknown command ${name}`);
    return command.run(...args);
  }

  getBlockSpec(type: string): BlockSpec | undefined { return this.blockSpecs.get(type); }

  getSlashItems(): SlashItem[] {
    const blocks = [...this.blockSpecs.values()].flatMap((spec) =>
      spec.slash ? [{ ...spec.slash, block: { type: spec.type } }] : [],
    );
    return [...blocks, ...[...this.plugins.values()].flatMap(({ plugin }) => plugin.slashItems ?? [])];
  }

  destroy(): void {
    for (const { dispose } of this.plugins.values()) dispose?.();
    this.plugins.clear();
    this.blockSpecs.clear();
    this.commands.clear();
  }
}

interface ClipboardBundle {
  version: 1;
  blocks: EditorBlock[];
  links: EditorLink[];
}

const flatten = (blocks: EditorBlock[]): EditorBlock[] => blocks.flatMap((block) => [block, ...flatten(block.children)]);
const textOf = (block: EditorBlock): string => block.content.map((run) => run.text).join("");
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
})[character] ?? character);

export class ClipboardManager {
  constructor(
    private readonly document: DocumentModelImpl,
    private readonly selection: SelectionManager,
  ) {}

  getSelectedBlocks(): EditorBlock[] {
    const all = flatten(this.document.document);
    const selection = this.selection.selection;
    if (!selection) return [];
    const start = all.findIndex((block) => block.id === selection.anchor.blockId);
    const end = all.findIndex((block) => block.id === selection.head.blockId);
    if (start < 0 || end < 0) return [];
    const selected = all.slice(Math.min(start, end), Math.max(start, end) + 1);
    const selectedIds = new Set(selected.map((block) => block.id));
    const parents = new Map<string, string>();
    const indexParents = (blocks: EditorBlock[]) => blocks.forEach((parent) => {
      parent.children.forEach((child) => parents.set(child.id, parent.id));
      indexParents(parent.children);
    });
    indexParents(this.document.document);
    return selected.filter((block) => {
      let parent = parents.get(block.id);
      while (parent) {
        if (selectedIds.has(parent)) return false;
        parent = parents.get(parent);
      }
      return true;
    });
  }

  async copy(): Promise<string> {
    const payload = this.createPayload();
    if (!payload) return "";
    const { bundle, html, text } = payload;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      const ClipboardItemClass = globalThis.ClipboardItem;
      if (ClipboardItemClass && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItemClass({
          [RIVTO_CLIPBOARD_MIME]: new Blob([JSON.stringify(bundle)], { type: RIVTO_CLIPBOARD_MIME }),
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        })]);
      } else {
        await navigator.clipboard.writeText(text);
      }
    }
    return text;
  }

  async cut(): Promise<string> {
    const text = await this.copy();
    const selected = this.getSelectedBlocks();
    if (selected.length > 1) selected.forEach((block) => this.document.removeBlock(block.id));
    else if (selected.length === 1) {
      const range = this.textRange(selected[0]);
      if (range) this.document.setBlockText(selected[0].id, range.text.slice(0, range.from) + range.text.slice(range.to));
    }
    return text;
  }

  async paste(text?: string): Promise<void> {
    if (text !== undefined) {
      this.pastePlain(text);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    if (navigator.clipboard.read) {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types.includes(RIVTO_CLIPBOARD_MIME)) {
          const bundle = JSON.parse(await (await item.getType(RIVTO_CLIPBOARD_MIME)).text()) as ClipboardBundle;
          this.pasteBundle(bundle);
          return;
        }
        if (item.types.includes("text/html")) {
          const html = await (await item.getType("text/html")).text();
          this.pastePlain(new DOMParser().parseFromString(html, "text/html").body.textContent ?? "");
          return;
        }
      }
    }
    this.pastePlain(await navigator.clipboard.readText());
  }

  handleCopyEvent(event: ClipboardEvent): void {
    const payload = this.createPayload();
    if (!payload || !event.clipboardData) return;
    event.preventDefault();
    event.clipboardData.setData(RIVTO_CLIPBOARD_MIME, JSON.stringify(payload.bundle));
    event.clipboardData.setData("text/html", payload.html);
    event.clipboardData.setData("text/plain", payload.text);
  }

  handlePasteEvent(event: ClipboardEvent): void {
    if (!event.clipboardData) return;
    event.preventDefault();
    const structured = event.clipboardData.getData(RIVTO_CLIPBOARD_MIME);
    if (structured) {
      this.pasteBundle(JSON.parse(structured) as ClipboardBundle);
      return;
    }
    const html = event.clipboardData.getData("text/html");
    if (html) {
      this.pastePlain(new DOMParser().parseFromString(html, "text/html").body.textContent ?? "");
      return;
    }
    this.pastePlain(event.clipboardData.getData("text/plain"));
  }

  pasteBundle(bundle: ClipboardBundle): void {
    if (bundle.version !== 1 || !Array.isArray(bundle.blocks)) throw new Error("Unsupported Rivto clipboard payload");
    const idMap = new Map<string, string>();
    const remap = (block: EditorBlock): PartialEditorBlock => {
      const id = crypto.randomUUID();
      idMap.set(block.id, id);
      return {
        ...block,
        id,
        layout: block.layout ? { ...block.layout, x: block.layout.x + 24, y: block.layout.y + 24 } : undefined,
        children: block.children.map(remap),
      };
    };
    const blocks = bundle.blocks.map(remap);
    const afterId = this.selection.selection?.head.blockId;
    let previous = afterId;
    this.document.transact(() => {
      blocks.forEach((block) => { previous = this.document.insertBlock(block, previous); });
      bundle.links.forEach((link) => {
        const from = idMap.get(link.from.blockId);
        const to = idMap.get(link.to.blockId);
        if (from && to) this.document.createLink({
          ...link,
          id: crypto.randomUUID(),
          from: { ...link.from, blockId: from },
          to: { ...link.to, blockId: to },
        });
      });
    });
  }

  private createPayload(): { bundle: ClipboardBundle; html: string; text: string } | undefined {
    const blocks = this.getSelectedBlocks();
    if (!blocks.length) return;
    const ids = new Set(flatten(blocks).map((block) => block.id));
    const links = this.document.links.filter((link) => ids.has(link.from.blockId) && ids.has(link.to.blockId));
    const selection = this.selection.selection;
    let text = blocks.map(textOf).join("\n");
    if (blocks.length === 1 && selection) {
      const range = this.textRange(blocks[0]);
      if (range) text = range.text.slice(range.from, range.to);
    }
    return {
      bundle: { version: 1, blocks, links },
      html: blocks.map((block) => `<p>${escapeHtml(textOf(block))}</p>`).join(""),
      text,
    };
  }

  private pastePlain(value: string): void {
    const selected = this.getSelectedBlocks()[0];
    if (!selected) {
      this.document.insertBlock({ content: value });
      return;
    }
    const range = this.textRange(selected);
    if (!range) return;
    this.document.setBlockText(selected.id, range.text.slice(0, range.from) + value + range.text.slice(range.to));
    const offset = range.from + value.length;
    this.selection.set({ anchor: { blockId: selected.id, offset }, head: { blockId: selected.id, offset } });
  }

  private textRange(block: EditorBlock): { text: string; from: number; to: number } | undefined {
    const selection = this.selection.selection;
    if (!selection || selection.anchor.blockId !== block.id || selection.head.blockId !== block.id) return;
    const text = textOf(block);
    return {
      text,
      from: Math.min(selection.anchor.offset, selection.head.offset),
      to: Math.max(selection.anchor.offset, selection.head.offset),
    };
  }
}

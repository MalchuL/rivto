import type { CRDTDoc } from "../../store/crdt-doc";
import type { Block, BlockInput, BlockLayout, BlockPatch, Link, Snapshot } from "../../store/document-model";
import type { BlockDefinition, BlockRegistry, SlashItem } from "../blocks";
import type { ClipboardManager, PluginManager, ProviderManager, RivtoPlugin, SelectionManager, UndoManager } from "../managers";

/** Editor presentation strategy selected by local UI state. */
export type EditorMode = "page" | "edgeless";

/** Markdown wrapper supported by the editor formatting command. */
export type MarkdownFormat = "bold" | "italic" | "strike" | "code" | "link";

/** One UTF-16 text position inside a block. */
export interface EditorPosition {
  /** Stable block ID containing the position. */
  blockId: string;
  /** UTF-16 offset compatible with browser DOM ranges. */
  offset: number;
}

/** Directed local selection from gesture anchor to active head. */
export interface EditorSelection {
  /** Position where the selection gesture began. */
  anchor: EditorPosition;
  /** Current active end of the selection gesture. */
  head: EditorPosition;
}

/** Construction options for one editor runtime. */
export interface CreateRivtoEditorOptions {
  /** Existing adapter-neutral collaborative document, or a fresh Yjs adapter by default. */
  document?: CRDTDoc;
  /** Typed blocks inserted only when the supplied document is empty. */
  initialContent?: BlockInput[];
  /** Trusted runtime plugins installed after built-in block definitions. */
  plugins?: RivtoPlugin[];
  /** Initial local presentation mode. */
  mode?: EditorMode;
}

/** Public runtime surface available to applications and trusted plugins. */
export interface RivtoEditorApi {
  /** Canonical adapter-neutral collaborative storage model. */
  readonly documentModel: import("../../store/document-model").DocumentModelImpl;
  /** Registry resolving native block types to runtime definitions. */
  readonly blocks: BlockRegistry;
  /** Local selection state owner. */
  readonly selectionManager: SelectionManager;
  /** Browser clipboard coordinator. */
  readonly clipboardManager: ClipboardManager;
  /** Collaboration-provider coordinator. */
  readonly providerManager: ProviderManager;
  /** Local collaborative history coordinator. */
  readonly undoManager: UndoManager;
  /** Trusted plugin lifecycle and command coordinator. */
  readonly pluginManager: PluginManager;
  /** Detached ordered block tree. */
  readonly document: Block[];
  /** Detached first-class document links. */
  readonly links: Link[];
  /** Directed local selection, or `null`. */
  readonly selection: EditorSelection | null;
  /** Current local rendering mode. */
  readonly mode: EditorMode;
  /** Monotonic view invalidation counter. */
  readonly revision: number;
  /** Creates a registered native block. */
  insertBlock(block: BlockInput, afterId?: string | null): string;
  /** Patches mutable fields without changing block identity or type. */
  updateBlock(id: string, patch: BlockPatch): void;
  /** Removes a block subtree and touching links. */
  removeBlock(id: string): void;
  /** Reorders a block after a sibling. */
  moveBlock(id: string, afterId: string | null): void;
  /** Nests a block under its preceding sibling. */
  indentBlock(id: string): void;
  /** Moves a nested block after its parent. */
  outdentBlock(id: string): void;
  /** Reconciles a block's complete Markdown source. */
  setBlockText(id: string, text: string): void;
  /** Inserts collaborative text at a UTF-16 offset. */
  insertText(id: string, offset: number, text: string): void;
  /** Deletes collaborative text at a UTF-16 range. */
  deleteText(id: string, offset: number, length: number): void;
  /** Sets one block-owned property. */
  setBlockProp(id: string, key: string, value: unknown): void;
  /** Sets data under one plugin namespace. */
  setPluginData(id: string, pluginId: string, value: unknown): void;
  /** Wraps a text range in Markdown syntax. */
  formatText(id: string, from: number, length: number, format: MarkdownFormat, value?: string): void;
  /** Copies the current selection. */
  copy(): Promise<string>;
  /** Copies and deletes the current selection. */
  cut(): Promise<string>;
  /** Pastes clipboard data using an explicit type for new plain-text blocks. */
  paste(defaultBlockType: string, text?: string): Promise<void>;
  /** Validates and sets local selection, or clears it with `null`. */
  setSelection(selection: EditorSelection | null): void;
  /** Changes local renderer mode. */
  setMode(mode: EditorMode): void;
  /** Patches collaborative edgeless geometry. */
  setBlockLayout(id: string, layout: Partial<BlockLayout>): void;
  /** Creates or replaces a first-class link. */
  createLink(link: Link): void;
  /** Removes a first-class link. */
  removeLink(id: string): void;
  /** Reverts the latest captured local operation. */
  undo(): void;
  /** Reapplies the latest undone local operation. */
  redo(): void;
  /** Requests focus for a block or the first editable block. */
  focus(blockId?: string): void;
  /** Returns a lossless schema-v3 snapshot. */
  getSnapshot(): Snapshot;
  /** Replaces document content from a schema-v3 snapshot. */
  loadSnapshot(snapshot: Snapshot): void;
  /** Defines one native block type. */
  defineBlock(definition: BlockDefinition): () => void;
  /** Installs one trusted runtime plugin. */
  use(plugin: RivtoPlugin): () => void;
  /** Runs a named plugin command. */
  runCommand(name: string, ...args: unknown[]): unknown;
  /** Returns block-generated and plugin-generated slash actions. */
  getSlashItems(): SlashItem[];
  /** Subscribes to one editor-level view event. */
  subscribe(event: EditorEvent, listener: () => void): () => void;
}

/** Editor-level event streams consumed by framework bindings. */
export type EditorEvent = "document" | "selection" | "mode" | "focus";

export type { Block, BlockInput, BlockLayout, BlockPatch, Link, Snapshot } from "../../store/document-model";
export type { BlockDefinition, SlashItem } from "../blocks";
export type { RivtoPlugin } from "../managers";

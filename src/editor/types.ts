import type { ComponentType, ReactNode } from "react";
import type { CRDTDoc } from "../store/crdt-doc";
import type {
  Block as EditorBlock,
  BlockLayout,
  Link as EditorLink,
  Mark,
  PartialBlock as PartialEditorBlock,
  Snapshot as EditorSnapshot,
} from "../store/document-model";
import type { ZodType } from "zod";

export type {
  BlockLayout,
  Block as EditorBlock,
  Link as EditorLink,
  Snapshot as EditorSnapshot,
  InlineContent,
  Mark,
  PartialBlock as PartialEditorBlock,
} from "../store/document-model";

export type EditorMode = "page" | "edgeless";

export interface EditorPosition {
  blockId: string;
  offset: number;
}

export interface EditorSelection {
  anchor: EditorPosition;
  head: EditorPosition;
}

export interface BlockRenderProps {
  block: EditorBlock;
  editor: RivtoEditorApi;
  content: ReactNode;
}

export interface SlashItem {
  title: string;
  aliases?: string[];
  group?: string;
  block?: PartialEditorBlock;
  run?: (editor: RivtoEditorApi, blockId: string) => void;
}

export interface BlockSpec {
  type: string;
  content: "inline" | "none";
  title?: string;
  propSchema?: ZodType<Record<string, unknown>>;
  render?: ComponentType<BlockRenderProps>;
  slash?: Omit<SlashItem, "block">;
}

export interface RivtoPlugin {
  id: string;
  blocks?: BlockSpec[];
  commands?: Record<string, (editor: RivtoEditorApi, ...args: unknown[]) => unknown>;
  slashItems?: SlashItem[];
  onRegister?: (editor: RivtoEditorApi) => void | (() => void);
}

export interface CreateRivtoEditorOptions {
  document?: CRDTDoc;
  initialContent?: PartialEditorBlock[];
  plugins?: RivtoPlugin[];
  mode?: EditorMode;
}

export interface RivtoEditorApi {
  readonly documentModel: import("../store/document-model").DocumentModelImpl;
  readonly pluginManager: import("./managers").PluginManager;
  readonly document: EditorBlock[];
  readonly links: EditorLink[];
  readonly selection: EditorSelection | null;
  readonly mode: EditorMode;
  readonly revision: number;
  insertBlock(block?: PartialEditorBlock, afterId?: string | null): string;
  updateBlock(id: string, patch: PartialEditorBlock): void;
  removeBlock(id: string): void;
  moveBlock(id: string, afterId: string | null): void;
  indentBlock(id: string): void;
  outdentBlock(id: string): void;
  setBlockText(id: string, text: string): void;
  insertText(id: string, offset: number, text: string, marks?: Record<string, unknown>): void;
  deleteText(id: string, offset: number, length: number): void;
  setBlockProp(id: string, key: string, value: unknown): void;
  setPluginData(id: string, pluginId: string, value: unknown): void;
  formatText(id: string, from: number, length: number, mark: Mark, value?: boolean | string): void;
  copy(): Promise<string>;
  cut(): Promise<string>;
  paste(text?: string): Promise<void>;
  setSelection(selection: EditorSelection | null): void;
  setMode(mode: EditorMode): void;
  setBlockLayout(id: string, layout: Partial<BlockLayout>): void;
  createLink(link: EditorLink): void;
  removeLink(id: string): void;
  undo(): void;
  redo(): void;
  focus(blockId?: string): void;
  getSnapshot(): EditorSnapshot;
  loadSnapshot(snapshot: EditorSnapshot): void;
  registerPlugin(plugin: RivtoPlugin): () => void;
  runCommand(name: string, ...args: unknown[]): unknown;
  getBlockSpec(type: string): BlockSpec | undefined;
  getSlashItems(): SlashItem[];
  subscribe(event: "document" | "selection" | "mode" | "focus", listener: () => void): () => void;
}

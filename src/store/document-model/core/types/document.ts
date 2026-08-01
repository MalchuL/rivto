import type { CRDTDoc, CRDTUndoScope, Unsubscribe } from "../../../crdt-doc";

/** Collaborative block geometry shared by all renderers. */
export interface BlockLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

/** Serializable block value read from collaborative storage. */
export interface Block {
  id: string;
  type: string;
  /** Persisted outline visibility; renderers decide whether to honor it. */
  collapsed: boolean;
  props: Record<string, unknown>;
  pluginData: Record<string, unknown>;
  /** Plain Markdown source stored collaboratively as CRDTText. */
  content: string;
  children: Block[];
  layout?: BlockLayout;
}

/** First-class connection between two collaborative blocks. */
export interface Link {
  id: string;
  from: { blockId: string; port?: string };
  to: { blockId: string; port?: string };
  meta?: Record<string, unknown>;
}

/** Complete input accepted when creating a block. */
export interface BlockInput {
  type: string;
  id?: string;
  /** Initial outline visibility; omitted creation values default to false. */
  collapsed?: boolean;
  props?: Record<string, unknown>;
  pluginData?: Record<string, unknown>;
  content?: string;
  children?: BlockInput[];
  layout?: Partial<BlockLayout>;
}

/** Mutable block fields; a block's type and identity are intentionally immutable. */
export interface BlockPatch {
  /** Replaces the persisted outline visibility when supplied. */
  collapsed?: boolean;
  props?: Record<string, unknown>;
  pluginData?: Record<string, unknown>;
  content?: string;
  layout?: Partial<BlockLayout>;
}

/** One identified block patch used by atomic multi-block updates. */
export interface BlockUpdate {
  id: string;
  patch: BlockPatch;
}

/** Lossless, versioned document value used for persistence. */
export interface Snapshot {
  version: 4;
  blocks: Block[];
  links: Link[];
  pluginData?: Record<string, unknown>;
}

/** Sections received from persistence that should replace only supplied state. */
export interface SnapshotUpdate {
  version: 4;
  blocks?: Block[];
  links?: Link[];
  pluginData?: Record<string, unknown>;
}

/** Library-neutral block property validator. */
export type BlockPropsValidator = (
  type: string,
  props: Record<string, unknown>,
) => Record<string, unknown>;

/** Public contract implemented by the Yjs-backed document model. */
export interface DocumentModel {
  readonly id: string;
  readonly crdt: CRDTDoc;
  readonly origin: symbol;
  readonly undoScopes: CRDTUndoScope[];
  readonly isEmpty: boolean;

  setPropsValidator(validator: BlockPropsValidator): void;
  subscribe(listener: () => void): Unsubscribe;
  transact(operation: () => void): void;
  getBlock(id: string): Block | undefined;
  getBlocks(): Block[];
  getLink(id: string): Link | undefined;
  getLinks(): Link[];
  getRootIds(): string[];
  getChildIds(id: string): string[];
  getParentId(id: string): string | null | undefined;
  getVisibleBlockIds(): string[];
  insertBlock(block: BlockInput, afterId?: string | null): string;
  updateBlock(id: string, patch: BlockPatch): void;
  updateBlocks(updates: readonly BlockUpdate[]): void;
  setBlockType(id: string, type: string, props?: Record<string, unknown>): void;
  setBlockProp(id: string, key: string, value: unknown): void;
  setPluginData(id: string, pluginId: string, value: unknown): void;
  setBlockText(id: string, text: string): void;
  insertText(id: string, offset: number, text: string): void;
  deleteText(id: string, offset: number, length: number): void;
  removeBlock(id: string): void;
  mergeBlocks(targetId: string, sourceId: string): number;
  moveBlock(id: string, targetId: string | null, position?: "before" | "after" | "inside"): void;
  moveBlocks(ids: string[], targetId: string | null, position?: "before" | "after" | "inside"): void;
  indentBlock(id: string): void;
  indentBlocks(ids: string[]): void;
  outdentBlock(id: string): void;
  outdentBlocks(ids: string[]): void;
  setBlockLayout(id: string, layout: Partial<BlockLayout>): void;
  createLink(link: Link): void;
  removeLink(id: string): void;
  getSnapshot(): Snapshot;
  loadSnapshot(snapshot: SnapshotUpdate): void;
  normalize(): void;
}

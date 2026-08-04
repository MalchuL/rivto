import type { BlockListProps } from "../blocks";

/** Collaborative block geometry as seen by editor features. */
export interface EditorBlockLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

/** Detached block value rendered by the editor. */
export interface EditorBlock {
  id: string;
  type: string;
  /** Persisted outline visibility exposed directly to editor features. */
  collapsed: boolean;
  /** Presentation used when this block renders among sibling blocks. */
  listProps: BlockListProps;
  props: Record<string, unknown>;
  pluginData: Record<string, unknown>;
  content: string;
  children: EditorBlock[];
  layout?: EditorBlockLayout;
}

/** Block creation data accepted by editor block helpers. */
export interface EditorBlockInput {
  type: string;
  id?: string;
  /** Initial outline visibility; defaults to false when omitted. */
  collapsed?: boolean;
  /** Initial multi-block presentation; omitted members receive their defaults. */
  listProps?: Partial<BlockListProps>;
  props?: Record<string, unknown>;
  pluginData?: Record<string, unknown>;
  content?: string;
  children?: EditorBlockInput[];
  layout?: Partial<EditorBlockLayout>;
}

/** Mutable editor block fields; type and identity are immutable. */
export interface EditorBlockPatch {
  /** Replaces the persisted outline visibility when supplied. */
  collapsed?: boolean;
  /** Merges supplied multi-block presentation fields. */
  listProps?: Partial<BlockListProps>;
  props?: Record<string, unknown>;
  pluginData?: Record<string, unknown>;
  content?: string;
  layout?: Partial<EditorBlockLayout>;
}

/** One identified editor block patch applied within a batch update. */
export interface EditorBlockUpdate {
  id: string;
  patch: EditorBlockPatch;
}

/** First-class connection between two editor blocks. */
export interface EditorLink {
  id: string;
  from: { blockId: string; port?: string };
  to: { blockId: string; port?: string };
  meta?: Record<string, unknown>;
}

/** Lossless editor document value used for persistence. */
export interface EditorSnapshot {
  version: 4;
  blocks: EditorBlock[];
  links: EditorLink[];
  pluginData?: Record<string, unknown>;
}

/** Persisted document sections that replace only supplied state. */
export interface EditorSnapshotUpdate {
  version: 4;
  blocks?: EditorBlock[];
  links?: EditorLink[];
  pluginData?: Record<string, unknown>;
}

import type { BlockListProps } from "../blocks";

/** Collaborative canvas geometry as seen by editor features. */
export interface EditorElementFrame {
  /** Horizontal canvas coordinate; may be negative. */
  x: number;
  /** Vertical canvas coordinate; may be negative. */
  y: number;
  /** Positive rendered width. */
  width: number;
  /** Positive rendered height. */
  height: number;
}

/** Detached first-class canvas element exposed to editor integrations. */
export interface EditorElement<Props extends Record<string, unknown> = Record<string, unknown>> {
  /** Stable element identity used by selection and commands. */
  id: string;
  /** Extension-owned renderer discriminator. */
  type: string;
  /** Persisted geometry independent from any referenced blocks. */
  frame: EditorElementFrame;
  /** Finite layer order. */
  zIndex: number;
  /** Opaque extension-owned properties. */
  props: Props;
}

/** Complete input accepted when creating a canvas element. */
export interface EditorElementInput<Props extends Record<string, unknown> = Record<string, unknown>> {
  id?: string;
  type: string;
  frame: EditorElementFrame;
  zIndex: number;
  props?: Props;
}

/** Mutable canvas element fields. */
export interface EditorElementPatch {
  frame?: Partial<EditorElementFrame>;
  zIndex?: number;
  props?: Record<string, unknown>;
}

/** One identified canvas element patch used by atomic updates. */
export interface EditorElementUpdate { id: string; patch: EditorElementPatch }

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
  version: 5;
  blocks: EditorBlock[];
  links: EditorLink[];
  elements: EditorElement[];
  pluginData?: Record<string, unknown>;
}

/** Persisted document sections that replace only supplied state. */
export interface EditorSnapshotUpdate {
  version: 5;
  blocks?: EditorBlock[];
  links?: EditorLink[];
  elements?: EditorElement[];
  pluginData?: Record<string, unknown>;
}

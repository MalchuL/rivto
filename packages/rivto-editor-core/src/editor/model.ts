import type {
  Block,
  BlockInput,
  BlockPatch,
  BlockUpdate,
} from "../store/document-model";

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

/** Canonical detached block value rendered by editor integrations. */
export type EditorBlock = Block;
/** Canonical block creation data accepted by editor helpers. */
export type EditorBlockInput = BlockInput;
/** Canonical mutable block fields. */
export type EditorBlockPatch = BlockPatch;
/** Canonical identified block patch. */
export type EditorBlockUpdate = BlockUpdate;

/** First-class connection between two editor blocks. */
export interface EditorLink {
  id: string;
  from: { blockId: string; port?: string };
  to: { blockId: string; port?: string };
  meta?: Record<string, unknown>;
}

/** Lossless editor document value used for persistence. */
export interface EditorSnapshot {
  version: 6;
  blocks: EditorBlock[];
  links: EditorLink[];
  elements: EditorElement[];
  pluginData?: Record<string, unknown>;
}

/** Persisted document sections that replace only supplied state. */
export interface EditorSnapshotUpdate {
  version: 6;
  blocks?: EditorBlock[];
  links?: EditorLink[];
  elements?: EditorElement[];
  pluginData?: Record<string, unknown>;
}

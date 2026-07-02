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
  props?: Record<string, unknown>;
  pluginData?: Record<string, unknown>;
  content?: string;
  children?: BlockInput[];
  layout?: Partial<BlockLayout>;
}

/** Mutable block fields; a block's type and identity are intentionally immutable. */
export interface BlockPatch {
  props?: Record<string, unknown>;
  pluginData?: Record<string, unknown>;
  content?: string;
  layout?: Partial<BlockLayout>;
}

/** Lossless, versioned document value used for persistence. */
export interface Snapshot {
  version: 3;
  blocks: Block[];
  links: Link[];
  pluginData?: Record<string, unknown>;
}

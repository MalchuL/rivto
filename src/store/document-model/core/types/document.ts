/** Inline mark names stored by the document model. */
export type Mark = "bold" | "italic" | "underline" | "strike" | "code" | "link";

/** A portable attributed text run returned by CRDTText. */
export interface InlineContent {
  text: string;
  marks?: Partial<Record<Mark, boolean | string>>;
}

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
  content: InlineContent[];
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

/** Input accepted when creating or patching a block. */
export interface PartialBlock {
  id?: string;
  type?: string;
  props?: Record<string, unknown>;
  pluginData?: Record<string, unknown>;
  content?: string | InlineContent[];
  children?: PartialBlock[];
  layout?: Partial<BlockLayout>;
}

/** Lossless, versioned document value used for persistence. */
export interface Snapshot {
  version: 2;
  blocks: Block[];
  links: Link[];
  pluginData?: Record<string, unknown>;
}

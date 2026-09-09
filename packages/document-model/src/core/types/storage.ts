import type {
  CRDTType,
  CRDTArray,
  CRDTMap,
  CRDTText,
} from "@chulane/crdt-doc";
import type { BlockListProps, ElementFrame } from "./document";

/** Collaborative geometry stored inside each first-class element record. */
export type ElementFrameStorage = Record<keyof ElementFrame, number>;

/** Collaborative presentation used when a block renders among siblings. */
export type BlockListPropsStorage = BlockListProps;

export type IDBlock = string;
export type IDElement = string;
export type IDPlugin = string;
export type IDProp = string;

/**
 * Exact shared fields stored for one block.
 *
 * Children contain block IDs rather than nested block maps, so moving a block
 * only changes ordered ID arrays and never rewrites its collaborative payload.
 */
export interface BlockStorage {
  id: IDBlock;
  type: string;
  /** Opaque collaborative page/outline properties. */
  listProps: CRDTMap<BlockListPropsStorage>;
  props: CRDTMap<Record<IDProp, CRDTType>>;
  content: CRDTText;
  children: CRDTArray<IDBlock>;
  pluginData: CRDTMap<Record<IDPlugin, CRDTType>>;
}

/** Exact shared fields stored for one generic canvas element. */
export interface ElementStorage {
  id: IDElement;
  type: string;
  frame: CRDTMap<ElementFrameStorage>;
  zIndex: number;
  props: CRDTMap<Record<IDProp, CRDTType>>;
}


import type {
  BasicCRDTType,
  BasicType,
  CRDTArray,
  CRDTMap,
  CRDTText,
} from "../../../crdt-doc";
import type { Link } from "./document";
import type { BlockListProps } from "../../../../blocks";

/** Typed geometry stored inside each collaborative block record. */
export interface BlockLayoutStorage {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

/** Collaborative presentation used when a block renders among siblings. */
export type BlockListPropsStorage = BlockListProps;

export type IDBlock = string;
export type IDLink = string;
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
  /** First-class collaborative outline visibility. */
  collapsed: boolean;
  /** First-class collaborative multi-block presentation properties. */
  listProps: CRDTMap<BlockListPropsStorage>;
  props: CRDTMap<Record<IDProp, BasicCRDTType>>;
  content: CRDTText;
  children: CRDTArray<IDBlock>;
  layout: CRDTMap<BlockLayoutStorage>;  // CRDTMap with keys of type IDBlockLayout (them are strings)
  pluginData: CRDTMap<Record<IDPlugin, BasicCRDTType>>;
}

/** Exact shared fields stored for a first-class link. */
export interface LinkStorage {
  id: IDLink;
  from: Link["from"];
  to: Link["to"];
  meta: Record<string, BasicType>;
}

import type {
  BasicCRDTType,
  BasicType,
  CRDTArray,
  CRDTMap,
  CRDTText,
} from "../../../crdt-doc";
import type { Link } from "./document";

/** Typed geometry stored inside each collaborative block record. */
export interface BlockLayoutStorage {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

/**
 * Exact shared fields stored for one block.
 *
 * Children contain block IDs rather than nested block maps, so moving a block
 * only changes ordered ID arrays and never rewrites its collaborative payload.
 */
export interface BlockStorage {
  id: string;
  type: string;
  props: CRDTMap<Record<string, BasicCRDTType>>;
  content: CRDTText;
  children: CRDTArray<string>;
  layout: CRDTMap<BlockLayoutStorage>;
  pluginData: CRDTMap<Record<string, BasicCRDTType>>;
}

/** Exact shared fields stored for a first-class link. */
export interface LinkStorage {
  id: string;
  from: Link["from"];
  to: Link["to"];
  meta: Record<string, BasicType>;
}

/** Top-level collaborative containers owned by DocumentModelImpl. */
export interface DocumentStorage {
  roots: CRDTArray<string>;
  blocks: CRDTMap<Record<string, CRDTMap<BlockStorage>>>;
  links: CRDTMap<Record<string, CRDTMap<LinkStorage>>>;
  pluginData: CRDTMap<Record<string, BasicCRDTType>>;
}

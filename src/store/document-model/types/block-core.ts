import type { ID } from './id';
export interface Coord { x: number; y: number; }
export interface Size { width: number; height: number; }

export interface BlockCore {
    id: ID;                  // unique id of the block
    type: string;            // type of the block
    order?: number;               // flow position
    position?: Coord;             // edgeless coords
    size?: Size;                  // size of the block on the canvas
    zIndex?: number;              // z-index of the block
    connectedWith?: ID | null;    // simple chain link to another block
    pluginStates: Record<string, any> // pluginId => payload (proxy returns {} when unset)
    meta?: Record<string, any> // meta data of the block
}
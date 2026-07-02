import type { CRDTArray } from "./array";
import type { CRDTMap } from "./map";
import type { CRDTText } from "./text";

export type CRDTUndoScope = CRDTArray | CRDTMap | CRDTText;

export interface CRDTUndoManager {
    undo(): void;
    redo(): void;
    clear(): void;
    stopCapturing(): void;
    destroy(): void;
}

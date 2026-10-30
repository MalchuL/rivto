import { createContext } from "react";

/** Actual child-region identity supplied by Page to host collapse controls. */
export interface BlockChildrenId {
  readonly blockId: string;
  readonly childrenId: string;
}

/** Supplied by the Page slot bridge for the owning block occurrence. */
export const BlockChildrenIdContext = createContext<BlockChildrenId | undefined>(undefined);

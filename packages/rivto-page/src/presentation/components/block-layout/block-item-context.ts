import { createContext } from "react";

/** Canonical sibling placement supplied by the shared iterator to one optional item. */
export interface BlockChildPlacement {
  /** Stable identity of the child placed by this item. */
  readonly blockId: string;
  /** Containing list's boundary policy; omission retains ordinary outline placement. */
  readonly dropPlacement?: "outline" | "siblings";
  /** Actual parent, null for document roots; absent for arbitrary display lists. */
  readonly parentId?: string | null;
  /** Canonical preceding sibling, or null at the start. */
  readonly previousId: string | null;
  /** Canonical following sibling, or null at the end. */
  readonly nextId: string | null;
}

/** Own-item placement without replacing the enclosing block's layout contexts. */
export const BlockChildPlacementContext = createContext<BlockChildPlacement | null>(null);
/** Identifies the child whose optional item wrapper owns its sibling-level CSS counter. */
export const BlockItemIdentityContext = createContext<string | null>(null);

/** Row-control placement scoped to one item identity, never to its descendants. */
export interface BlockItemControls {
  readonly blockId: string;
  readonly placement: "inside" | "outside";
}

/** Borrowed placement for the matching block row; other identities use outside. */
export const BlockItemControlsContext = createContext<BlockItemControls | null>(null);

/** Inherited row-control placement selected by the nearest explicit child layout. */
export const BlockChildrenControlsContext = createContext<"inside" | "outside">("outside");

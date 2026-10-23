/** Stable first-class element ID stored in local edgeless selection. */
export type EdgelessSelectionRef = string;

/** Detached local view of the generic editor selection. */
export interface EdgelessSelectionSnapshot {
  readonly active: boolean;
  readonly items: readonly EdgelessSelectionRef[];
}
